import { NextResponse } from "next/server";
import { getMongo } from "@/lib/mongodb";
import { exchangeGoogleCode, fetchGoogleUserInfo } from "@/lib/google";
import { encryptSecret, sha256 } from "@/lib/security";
import { createSession, getSession } from "@/lib/session";
import { OAuthState } from "@/models/oauth-state";
import { GoogleAccount } from "@/models/google-account";
import { User } from "@/models/user";
import { Company } from "@/models/company";
import { Membership } from "@/models/membership";
import { Workspace } from "@/models/workspace";
import { Invitation } from "@/models/invitation";
import { AvailabilityRule } from "@/models/availability-rule";
import { clearGoogleAccessTokenCache } from "@/lib/google-calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GoogleIdentity = {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

function errorPathForOAuth(
  request: Request,
  intent: string,
  companySlug?: string,
  error?: string
) {
  const fallback = intent === "customer" && companySlug
    ? `/${companySlug}`
    : intent === "company" && companySlug
      ? `/${companySlug}/login`
      : intent === "employee" && companySlug
        ? `/${companySlug}/login`
        : "/login";

  const target = new URL(fallback, request.url);
  if (error) target.searchParams.set("error", error);
  return target;
}

function safeInternalPath(path: string | undefined, fallback: string) {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return fallback;
  return path;
}


async function acceptPendingEmployeeInvitation(
  companyId: unknown,
  email: string,
  googleUser: GoogleIdentity
) {
  const invite = await Invitation.findOne({
    companyId,
    invitedEmail: email,
    expiresAt: { $gt: new Date() },
    acceptedAt: null,
    role: "EMPLOYEE"
  }).sort({ createdAt: -1 });

  if (!invite) return null;

  const workspace = await Workspace.findById(invite.workspaceId).lean();
  if (!workspace) throw new Error("WORKSPACE_NOT_FOUND");

  let user = await User.findOne({ email });
  if (!user) {
    user = await User.create({
      email,
      name: googleUser.name || email.split("@")[0],
      image: googleUser.picture,
      role: "EMPLOYEE",
      googleSubject: googleUser.sub,
      googleEmail: email,
      lastLoginAt: new Date()
    });
  } else {
    user.set({
      name: googleUser.name || user.name,
      image: googleUser.picture || user.image,
      googleSubject: googleUser.sub,
      googleEmail: email,
      role: user.role === "PLATFORM_ADMIN" ? user.role : "EMPLOYEE",
      lastLoginAt: new Date()
    });
    await user.save();
  }

  const membership = await Membership.findOneAndUpdate(
    { companyId, userId: user._id },
    {
      $set: {
        companyId,
        workspaceId: invite.workspaceId,
        userId: user._id,
        role: "EMPLOYEE",
        active: true
      }
    },
    { upsert: true, new: true }
  ).lean();

  const existingRules = await AvailabilityRule.countDocuments({
    companyId,
    employeeId: user._id,
    active: true
  });

  if (existingRules === 0) {
    const defaultRules = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
      companyId,
      employeeId: user._id,
      dayOfWeek,
      startMinute: 9 * 60,
      endMinute: 17 * 60,
      timezone: workspace.timezone || "Asia/Kolkata",
      active: true
    }));
    await AvailabilityRule.insertMany(defaultRules);
  }

  await Invitation.updateOne(
    { _id: invite._id, acceptedAt: null },
    { $set: { acceptedAt: new Date(), acceptedUserId: user._id } }
  );

  return { user, membership, workspaceId: String(invite.workspaceId) };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    return NextResponse.redirect(errorPathForOAuth(request, "workspace", undefined, oauthError));
  }
  if (!state || !code) {
    return NextResponse.redirect(errorPathForOAuth(request, "workspace", undefined, "missing_oauth_response"));
  }

  const cookieHeader = request.headers.get("cookie") ?? "";
  const expected = cookieHeader.match(/(?:^|; )conventus_oauth_state=([^;]+)/)?.[1];
  if (!expected || state !== expected) {
    return NextResponse.redirect(errorPathForOAuth(request, "workspace", undefined, "invalid_oauth_state"));
  }

  await getMongo();
  const oauth = await OAuthState.findOneAndDelete({
    state,
    expiresAt: { $gt: new Date() }
  }).lean();

  if (!oauth) {
    return NextResponse.redirect(errorPathForOAuth(request, "workspace", undefined, "expired_oauth_state"));
  }

  const companySlug = oauth.companySlug?.toLowerCase();
  const fallbackReturnTo =
    oauth.intent === "customer" && companySlug
      ? `/${companySlug}`
      : oauth.intent === "company" || oauth.intent === "employee"
        ? "/dashboard"
        : "/dashboard";
  const returnTo = safeInternalPath(oauth.returnTo, fallbackReturnTo);

  try {
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;
    if (!redirectUri) throw new Error("GOOGLE_OAUTH_NOT_CONFIGURED");

    const token = await exchangeGoogleCode(code, redirectUri);
    const googleUser = await fetchGoogleUserInfo(token.access_token) as GoogleIdentity;

    if (!googleUser.email || googleUser.email_verified === false) {
      throw new Error("GOOGLE_EMAIL_NOT_VERIFIED");
    }

    const email = googleUser.email.toLowerCase();

    if (oauth.intent === "connect") {
      const current = await getSession();
      if (!current) throw new Error("SESSION_EXPIRED");

      const existing = await GoogleAccount.findOne({ userId: current.userId }).lean();
      if (!token.refresh_token && !existing?.encryptedRefreshToken) {
        throw new Error("GOOGLE_REFRESH_TOKEN_MISSING");
      }

      await GoogleAccount.findOneAndUpdate(
        { userId: current.userId },
        {
          $set: {
            userId: current.userId,
            googleSubject: googleUser.sub,
            googleEmail: email,
            encryptedRefreshToken: token.refresh_token
              ? await encryptSecret(token.refresh_token)
              : existing!.encryptedRefreshToken,
            accessTokenExpiresAt: new Date(Date.now() + token.expires_in * 1000),
            scopes: (token.scope ?? "").split(" ").filter(Boolean),
            status: "CONNECTED",
            lastSuccessfulSyncAt: new Date()
          }
        },
        { upsert: true, new: true }
      );

      await Membership.updateMany(
        { userId: current.userId },
        { $set: { googleConnectionStatus: "CONNECTED" } }
      );

      // A reconnect may have replaced the refresh token/scopes while Redis still
      // contains an access token from the previous Google authorization.
      await clearGoogleAccessTokenCache(current.userId);

      const response = NextResponse.redirect(new URL(returnTo, request.url));
      response.cookies.delete("conventus_oauth_state");
      return response;
    }

    if ((oauth.intent === "company" || oauth.intent === "customer") && companySlug) {
      const company = await Company.findOne({ slug: companySlug }).lean();
      if (!company) throw new Error("COMPANY_NOT_FOUND");

      let user = await User.findOne({ email });

      const membership = user
        ? await Membership.findOne({
            companyId: company._id,
            userId: user._id,
            active: true
          }).lean()
        : null;

      if (membership) {
        user!.set({
          name: googleUser.name || user!.name,
          image: googleUser.picture || user!.image,
          googleSubject: googleUser.sub,
          googleEmail: email,
          lastLoginAt: new Date()
        });
        await user!.save();

        await createSession({
          userId: String(user!._id),
          role: String(membership.role),
          companyId: String(company._id),
          workspaceId: String(membership.workspaceId)
        });

        const response = NextResponse.redirect(new URL("/dashboard", request.url));
        response.cookies.delete("conventus_oauth_state");
        return response;
      }

      const pendingEmployee = await acceptPendingEmployeeInvitation(company._id, email, googleUser);
      if (pendingEmployee) {
        await createSession({
          userId: String(pendingEmployee.user._id),
          role: "EMPLOYEE",
          companyId: String(company._id),
          workspaceId: pendingEmployee.workspaceId
        });

        const response = NextResponse.redirect(new URL("/dashboard", request.url));
        response.cookies.delete("conventus_oauth_state");
        return response;
      }

      if (oauth.intent === "company") {
        throw new Error("COMPANY_EMPLOYEE_ACCESS_REQUIRED");
      }

      if (!user) {
        user = await User.create({
          email,
          name: googleUser.name || email.split("@")[0],
          image: googleUser.picture,
          role: bootstrapPlatformAdmin ? "PLATFORM_ADMIN" : "CUSTOMER",
          googleSubject: googleUser.sub,
          googleEmail: email,
          lastLoginAt: new Date()
        });
      } else {
        user.set({
          name: googleUser.name || user.name,
          image: googleUser.picture || user.image,
          googleSubject: googleUser.sub,
          googleEmail: email,
          lastLoginAt: new Date()
        });
        await user.save();
      }

      await createSession({
        userId: String(user._id),
        role: "CUSTOMER"
      });

      const response = NextResponse.redirect(new URL(returnTo, request.url));
      response.cookies.delete("conventus_oauth_state");
      return response;
    }

    if (oauth.intent === "employee" && !oauth.invitationToken) {
      throw new Error("INVITATION_REQUIRED");
    }

    if (oauth.intent === "company" && !companySlug) {
      throw new Error("COMPANY_NOT_CONFIGURED");
    }

    if (oauth.intent === "employee" && oauth.invitationToken) {
      if (!companySlug) throw new Error("COMPANY_NOT_CONFIGURED");

      const invite = await Invitation.findOne({
        tokenHash: sha256(oauth.invitationToken),
        expiresAt: { $gt: new Date() },
        acceptedAt: null
      });

      if (!invite || invite.invitedEmail !== email) {
        throw new Error("INVITATION_INVALID");
      }

      const workspace = await Workspace.findById(invite.workspaceId).lean();
      if (!workspace) throw new Error("WORKSPACE_NOT_FOUND");

      let user = await User.findOne({ email });
      if (!user) {
        user = await User.create({
          email,
          name: googleUser.name || email.split("@")[0],
          image: googleUser.picture,
          role: bootstrapPlatformAdmin ? "PLATFORM_ADMIN" : "EMPLOYEE",
          googleSubject: googleUser.sub,
          googleEmail: email,
          lastLoginAt: new Date()
        });
      } else {
        user.set({
          name: googleUser.name || user.name,
          image: googleUser.picture || user.image,
          googleSubject: googleUser.sub,
          googleEmail: email,
          role: (bootstrapPlatformAdmin || user.role === "PLATFORM_ADMIN") ? "PLATFORM_ADMIN" : "EMPLOYEE",
          lastLoginAt: new Date()
        });
        await user.save();
      }

      const membership = await Membership.findOneAndUpdate(
        { companyId: invite.companyId, userId: user._id },
        {
          $set: {
            companyId: invite.companyId,
            workspaceId: invite.workspaceId,
            userId: user._id,
            role: "EMPLOYEE",
            active: true,
            googleConnectionStatus: "DISCONNECTED"
          }
        },
        { upsert: true, new: true }
      ).lean();

      const existingRules = await AvailabilityRule.countDocuments({
        companyId: invite.companyId,
        employeeId: user._id,
        active: true
      });

      if (existingRules === 0) {
        const defaultRules = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
          companyId: invite.companyId,
          employeeId: user._id,
          dayOfWeek,
          startMinute: 9 * 60,
          endMinute: 17 * 60,
          timezone: workspace.timezone || "Asia/Kolkata",
          active: true
        }));
        await AvailabilityRule.insertMany(defaultRules);
      }

      await Invitation.updateOne(
        { _id: invite._id, acceptedAt: null },
        { $set: { acceptedAt: new Date(), acceptedUserId: user._id } }
      );

      await createSession({
        userId: String(user._id),
        role: String(membership.role),
        companyId: String(invite.companyId),
        workspaceId: String(invite.workspaceId)
      });

      const response = NextResponse.redirect(new URL(returnTo, request.url));
      response.cookies.delete("conventus_oauth_state");
      return response;
    }

    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({
        email,
        name: googleUser.name || email.split("@")[0],
        image: googleUser.picture,
        role: bootstrapPlatformAdmin ? "PLATFORM_ADMIN" : "COMPANY_OWNER",
        googleSubject: googleUser.sub,
        googleEmail: email,
        lastLoginAt: new Date()
      });
    } else {
      user.set({
        name: googleUser.name || user.name,
        image: googleUser.picture || user.image,
        googleSubject: googleUser.sub,
        googleEmail: email,
        role: bootstrapPlatformAdmin ? "PLATFORM_ADMIN" : user.role,
        lastLoginAt: new Date()
      });
      await user.save();
    }

    const activeMemberships = await Membership.find({
      userId: user._id,
      active: true,
      role: { $in: ["COMPANY_OWNER", "COMPANY_ADMIN", "EMPLOYEE"] }
    }).sort({ createdAt: -1 }).limit(2).lean();

    const scopedMembership = activeMemberships[0];

    await createSession({
      userId: String(user._id),
      role: scopedMembership ? String(scopedMembership.role) : String(user.role),
      companyId: scopedMembership ? String(scopedMembership.companyId) : undefined,
      workspaceId: scopedMembership ? String(scopedMembership.workspaceId) : undefined
    });

    const response = NextResponse.redirect(new URL(returnTo, request.url));
    response.cookies.delete("conventus_oauth_state");
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "google_auth_failed";
    const response = NextResponse.redirect(
      errorPathForOAuth(request, oauth.intent, companySlug, message.toLowerCase().slice(0, 80))
    );
    response.cookies.delete("conventus_oauth_state");
    return response;
  }
}
