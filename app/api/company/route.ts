import { NextResponse } from "next/server";
import { getMongo } from "@/lib/mongodb";
import { getSession, updateSessionScope } from "@/lib/session";
import { Company } from "@/models/company";
import { Workspace } from "@/models/workspace";
import { Membership } from "@/models/membership";
import { Subscription } from "@/models/subscription";
import { MeetingType } from "@/models/meeting-type";
import { AvailabilityRule } from "@/models/availability-rule";
import { slugify } from "@/lib/slug";
import { jsonError, jsonOk } from "@/lib/http";
import { isGoogleSchedulingReady } from "@/lib/google-scheduling";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return jsonError("UNAUTHENTICATED", 401);

  await getMongo();
  if (session.companyId && ["COMPANY_OWNER", "COMPANY_ADMIN", "EMPLOYEE"].includes(session.role)) {
    const membership = await Membership.findOne({ companyId: session.companyId, userId: session.userId, active: true }).lean();
    if (!membership) return jsonError("FORBIDDEN", 403);
  }
  const company = session.companyId ? await Company.findById(session.companyId).lean() : await Company.findOne({ ownerUserId: session.userId }).lean();
  if (!company) return jsonOk(null);

  const workspace = await Workspace.findOne({ companyId: company._id }).lean();
  const subscription = await Subscription.findOne({ companyId: company._id }).lean();
  const activeMembers = await Membership.find({
    companyId: company._id,
    active: true,
    role: { $in: ["COMPANY_OWNER", "COMPANY_ADMIN", "EMPLOYEE"] }
  }).select("userId").lean();
  const { GoogleAccount } = await import("@/models/google-account");
  const connectedAccounts = await GoogleAccount.find({
    userId: { $in: activeMembers.map((member) => member.userId) },
    status: "CONNECTED"
  }).select("userId status scopes").lean();
  const connectedMemberCount = connectedAccounts.filter(isGoogleSchedulingReady).length;
  const memberCount = activeMembers.length;

  return jsonOk({
    company: { id: String(company._id), name: company.name, slug: company.slug, description: company.description, publicBookingEnabled: company.publicBookingEnabled },
    workspace: workspace ? { id: String(workspace._id), name: workspace.name, timezone: workspace.timezone, planId: workspace.planId } : null,
    subscription: subscription ? { planId: subscription.planId, status: subscription.status, monthlyMeetingsUsed: subscription.monthlyMeetingsUsed, periodEnd: subscription.currentPeriodEnd } : null,
    memberCount,
    connectedMemberCount,
    canPublish: connectedMemberCount > 0
  });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return jsonError("UNAUTHENTICATED", 401);
  if (!["COMPANY_OWNER", "PLATFORM_ADMIN"].includes(session.role)) return jsonError("FORBIDDEN", 403);

  await getMongo();
  const existing = await Company.findOne({ ownerUserId: session.userId }).lean();
  if (existing) return jsonError("COMPANY_ALREADY_EXISTS", 409);

  let body: { name?: string; slug?: string; description?: string; timezone?: string };
  try { body = await request.json(); } catch { return jsonError("INVALID_JSON"); }

  const name = body.name?.trim();
  if (!name || name.length < 2 || name.length > 100) return jsonError("INVALID_COMPANY_NAME");

  const slug = slugify(body.slug?.trim() || name);
  const collision = await Company.findOne({ slug }).lean();
  if (collision) return jsonError("COMPANY_SLUG_TAKEN", 409);

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  const db = await getMongo();
  const tx = await db.startSession();
  try {
    const createdIds = await tx.withTransaction(async () => {
      const [company] = await Company.create([{ name, slug, description: body.description?.trim().slice(0, 1200), ownerUserId: session.userId }], { session: tx });
      const [workspace] = await Workspace.create([{ companyId: company._id, name: `${name} workspace`, timezone: body.timezone || "Asia/Kolkata", planId: "starter" }], { session: tx });
      await Subscription.create([{ companyId: company._id, planId: "starter", status: "ACTIVE", currentPeriodStart: now, currentPeriodEnd: periodEnd, monthlyMeetingsUsed: 0 }], { session: tx });
      await Membership.create([{ companyId: company._id, workspaceId: workspace._id, userId: session.userId, role: "COMPANY_OWNER", active: true, googleConnectionStatus: "DISCONNECTED" }], { session: tx });
      await MeetingType.create([{ companyId: company._id, workspaceId: workspace._id, name: "General meeting", slug: "general", durationOptionsMinutes: [20] }], { session: tx });

      const rules = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
        companyId: company._id, employeeId: session.userId, dayOfWeek, startMinute: 9 * 60, endMinute: 17 * 60, timezone: body.timezone || "Asia/Kolkata", active: true
      }));
      await AvailabilityRule.insertMany(rules, { session: tx });

      return { companyId: String(company._id), workspaceId: String(workspace._id) };
    });

    if (!createdIds) throw new Error("COMPANY_CREATE_FAILED");
    await updateSessionScope(session.userId, createdIds);
    return jsonOk({ companyId: createdIds.companyId, workspaceId: createdIds.workspaceId, slug }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "COMPANY_CREATE_FAILED";
    return jsonError(message, 500);
  } finally {
    await tx.endSession();
  }
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) return jsonError("UNAUTHENTICATED", 401);
  if (!["COMPANY_OWNER", "COMPANY_ADMIN", "PLATFORM_ADMIN"].includes(session.role)) return jsonError("FORBIDDEN", 403);

  await getMongo();
  const body = await request.json().catch(() => null) as { publicBookingEnabled?: boolean; description?: string } | null;
  if (!session.companyId) return jsonError("COMPANY_NOT_CONFIGURED", 400);
  if (["COMPANY_OWNER", "COMPANY_ADMIN", "EMPLOYEE"].includes(session.role)) {
    const membership = await Membership.findOne({ companyId: session.companyId, userId: session.userId, active: true }).lean();
    if (!membership) return jsonError("FORBIDDEN", 403);
  }

  const update: Record<string, unknown> = {};
  if (typeof body?.publicBookingEnabled === "boolean") {
    if (body.publicBookingEnabled) {
      const { GoogleAccount } = await import("@/models/google-account");
      const members = await Membership.find({
        companyId: session.companyId,
        active: true,
        role: { $in: ["COMPANY_OWNER", "COMPANY_ADMIN", "EMPLOYEE"] }
      }).select("userId").lean();
      const accounts = await GoogleAccount.find({
        userId: { $in: members.map((member) => member.userId) },
        status: "CONNECTED"
      }).select("userId status scopes").lean();
      if (!accounts.some(isGoogleSchedulingReady)) {
        return jsonError("GOOGLE_SCHEDULING_CONNECTION_REQUIRED", 409);
      }
    }
    update.publicBookingEnabled = body.publicBookingEnabled;
  }
  if (typeof body?.description === "string") update.description = body.description.trim().slice(0, 1200);

  const company = await Company.findOneAndUpdate(
    { _id: session.companyId, ownerUserId: session.role === "COMPANY_OWNER" ? session.userId : { $exists: true } },
    { $set: update },
    { new: true }
  ).lean();

  if (!company) return jsonError("COMPANY_NOT_FOUND", 404);
  return jsonOk({
    company: { id: String(company._id), name: company.name, slug: company.slug, description: company.description, publicBookingEnabled: company.publicBookingEnabled }
  });
}
