import { NextResponse } from "next/server";
import { getMongo } from "@/lib/mongodb";
import { exchangeGoogleCode, fetchGoogleUserInfo } from "@/lib/google";
import { encryptSecret, sha256 } from "@/lib/security";
import { createSession, getSession, updateSessionScope } from "@/lib/session";
import { OAuthState } from "@/models/oauth-state";
import { GoogleAccount } from "@/models/google-account";
import { User } from "@/models/user";
import { Company } from "@/models/company";
import { Membership } from "@/models/membership";
import { Workspace } from "@/models/workspace";
import { Invitation } from "@/models/invitation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirectWithError(request: Request, error: string) {
  return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error)}`, request.url));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const oauthError = url.searchParams.get("error");

  if (oauthError) return redirectWithError(request, oauthError);
  if (!state || !code) return redirectWithError(request, "missing_oauth_response");

  const cookieHeader = request.headers.get("cookie") ?? "";
  const expected = cookieHeader.match(/(?:^|; )conventus_oauth_state=([^;]+)/)?.[1];
  if (!expected || state !== expected) return redirectWithError(request, "invalid_oauth_state");

  await getMongo();
  const oauth = await OAuthState.findOneAndDelete({
    state,
    expiresAt: { $gt: new Date() }
  }).lean();

  if (!oauth) return redirectWithError(request, "expired_oauth_state");

  try {
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;
    if (!redirectUri) throw new Error("GOOGLE_OAUTH_NOT_CONFIGURED");

    const token = await exchangeGoogleCode(code, redirectUri);
    const googleUser = await fetchGoogleUserInfo(token.access_token);

    if (!googleUser.email || googleUser.email_verified === false) {
      throw new Error("GOOGLE_EMAIL_NOT_VERIFIED");
    }

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
            googleEmail: googleUser.email.toLowerCase(),
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

      const response = NextResponse.redirect(new URL(oauth.returnTo || "/dashboard", request.url));
      response.cookies.delete("conventus_oauth_state");
      return response;
    }

    const email = googleUser.email.toLowerCase();
    let user = await User.findOne({ email });

    if (oauth.intent === "employee" && oauth.invitationToken) {
      const invite = await Invitation.findOne({
        tokenHash: sha256(oauth.invitationToken),
        expiresAt: { $gt: new Date() },
        acceptedAt: null
      });

      if (!invite || invite.invitedEmail !== email) {
        throw new Error("INVITATION_INVALID");
      }

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

      await Membership.findOneAndUpdate(
        { companyId: invite.companyId, userId: user._id },
        {
          $set: {
            companyId: invite.companyId,
            workspaceId: invite.workspaceId,
            userId: user._id,
            role: "EMPLOYEE",
            active: true
          }
        },
        { upsert: true, new: true }
      );

      await Invitation.updateOne(
        { _id: invite._id },
        { $set: { acceptedAt: new Date(), acceptedUserId: user._id } }
      );

      await createSession({
        userId: String(user._id),
        role: "EMPLOYEE",
        companyId: String(invite.companyId),
        workspaceId: String(invite.workspaceId)
      });

      const response = NextResponse.redirect(new URL("/dashboard", request.url));
      response.cookies.delete("conventus_oauth_state");
      return response;
    }

    if (!user) {
      user = await User.create({
        email,
        name: googleUser.name || email.split("@")[0],
        image: googleUser.picture,
        role: oauth.intent === "customer" ? "CUSTOMER" : "COMPANY_OWNER",
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

    const role = String(user.role);
    const response = NextResponse.redirect(new URL(oauth.returnTo || (role === "CUSTOMER" ? "/" : "/dashboard"), request.url));
    await createSession({
      userId: String(user._id),
      role,
      companyId: oauth.intent === "customer" ? undefined : undefined,
      workspaceId: undefined
    });
    response.cookies.delete("conventus_oauth_state");
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "google_auth_failed";
    return redirectWithError(request, message.toLowerCase().slice(0, 80));
  }
}
