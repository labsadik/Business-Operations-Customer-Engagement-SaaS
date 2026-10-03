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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return jsonError("UNAUTHENTICATED", 401);

  await getMongo();
  const company = session.companyId ? await Company.findById(session.companyId).lean() : await Company.findOne({ ownerUserId: session.userId }).lean();
  if (!company) return jsonOk(null);

  const workspace = await Workspace.findOne({ companyId: company._id }).lean();
  const subscription = await Subscription.findOne({ companyId: company._id }).lean();
  const memberCount = await Membership.countDocuments({ companyId: company._id, active: true, role: { $in: ["COMPANY_OWNER", "COMPANY_ADMIN", "EMPLOYEE"] } });

  return jsonOk({
    company: { id: String(company._id), name: company.name, slug: company.slug, description: company.description, publicBookingEnabled: company.publicBookingEnabled },
    workspace: workspace ? { id: String(workspace._id), name: workspace.name, timezone: workspace.timezone, planId: workspace.planId } : null,
    subscription: subscription ? { planId: subscription.planId, status: subscription.status, monthlyMeetingsUsed: subscription.monthlyMeetingsUsed, periodEnd: subscription.currentPeriodEnd } : null,
    memberCount
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
    let ids: { companyId: string; workspaceId: string } | null = null;
    await tx.withTransaction(async () => {
      const [company] = await Company.create([{ name, slug, description: body.description?.trim().slice(0, 1200), ownerUserId: session.userId }], { session: tx });
      const [workspace] = await Workspace.create([{ companyId: company._id, name: `${name} workspace`, timezone: body.timezone || "Asia/Kolkata", planId: "starter" }], { session: tx });
      await Subscription.create([{ companyId: company._id, planId: "starter", status: "ACTIVE", currentPeriodStart: now, currentPeriodEnd: periodEnd, monthlyMeetingsUsed: 0 }], { session: tx });
      await Membership.create([{ companyId: company._id, workspaceId: workspace._id, userId: session.userId, role: "COMPANY_OWNER", active: true, googleConnectionStatus: "DISCONNECTED" }], { session: tx });
      await MeetingType.create([{ companyId: company._id, workspaceId: workspace._id, name: "General meeting", slug: "general", durationOptionsMinutes: [20] }], { session: tx });

      const rules = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
        companyId: company._id, employeeId: session.userId, dayOfWeek, startMinute: 9 * 60, endMinute: 17 * 60, timezone: body.timezone || "Asia/Kolkata", active: true
      }));
      await AvailabilityRule.insertMany(rules, { session: tx });

      ids = { companyId: String(company._id), workspaceId: String(workspace._id) };
    });

    if (!ids) throw new Error("COMPANY_CREATE_FAILED");
    await updateSessionScope(session.userId, ids);
    return jsonOk({ ...ids, slug }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "COMPANY_CREATE_FAILED";
    return jsonError(message, 500);
  } finally {
    await tx.endSession();
  }
}