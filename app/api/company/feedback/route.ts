import { Types } from "mongoose";
import { getMongo } from "@/lib/mongodb";
import { Feedback } from "@/models/feedback";
import { User } from "@/models/user";
import { Membership } from "@/models/membership";
import { Workspace } from "@/models/workspace";
import { getSession } from "@/lib/session";
import { withRedisLock } from "@/lib/redis-lock";
import { assertSameOrigin } from "@/lib/security";
import { jsonError, jsonOk } from "@/lib/http";
import { isCompanyPlanSuspended } from "@/lib/plans-server";
import {
  canSeeCompanyPlatformFeedback,
  isValidFeedbackStatusTransition,
  validateFeedbackInput
} from "@/lib/platform-communication";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireCompanyFeedbackViewer() {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHENTICATED");
  if (!session.companyId) throw new Error("FORBIDDEN");

  await getMongo();

  if (session.role === "PLATFORM_ADMIN") {
    if (!session.workspaceId) throw new Error("FORBIDDEN");
    const workspace = await Workspace.findOne({
      _id: session.workspaceId,
      companyId: session.companyId,
      active: true
    }).select("_id").lean();
    if (!workspace) throw new Error("FORBIDDEN");
    return session;
  }

  if (!canSeeCompanyPlatformFeedback(session.role)) {
    throw new Error("FORBIDDEN");
  }

  const membership = await Membership.findOne({
    companyId: session.companyId,
    userId: session.userId,
    active: true,
    role: session.role
  }).select("_id companyId workspaceId").lean();

  if (!membership) throw new Error("FORBIDDEN");
  if (await isCompanyPlanSuspended(session.companyId)) throw new Error("PLAN_SUSPENDED");
  return session;
}

async function requireCompanyFeedbackMember() {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHENTICATED");
  if (
    !session.companyId ||
    !["COMPANY_ADMIN", "EMPLOYEE"].includes(session.role)
  ) {
    throw new Error("FORBIDDEN");
  }

  await getMongo();
  const membership = await Membership.findOne({
    companyId: session.companyId,
    userId: session.userId,
    active: true,
    role: session.role
  }).select("_id companyId workspaceId").lean();

  if (!membership) throw new Error("FORBIDDEN");

  const workspace = await Workspace.findOne({
    _id: membership.workspaceId,
    companyId: membership.companyId,
    active: true
  }).select("_id").lean();

  if (!workspace) throw new Error("FORBIDDEN");
  if (await isCompanyPlanSuspended(session.companyId)) throw new Error("PLAN_SUSPENDED");

  return {
    session,
    companyId: String(membership.companyId),
    workspaceId: String(membership.workspaceId)
  };
}

async function serialize(items: Array<{
  _id: unknown;
  rating: number;
  description: string;
  createdAt: Date;
  reviewStatus: string;
  source: string;
  submitterUserId?: unknown;
  submitterName?: string;
  submitterEmail?: string;
  submitterPhone?: string;
}>) {
  const ids = [...new Set(items.map((item) => String(item.submitterUserId ?? "")).filter(Boolean))];
  const users = ids.length
    ? await User.find({ _id: { $in: ids } }).select("_id name").limit(50).lean()
    : [];
  const map = new Map(users.map((user) => [String(user._id), { name: user.name }]));

  return items.map((item) => ({
    id: String(item._id),
    rating: item.rating,
    description: item.description,
    createdAt: item.createdAt,
    reviewStatus: item.reviewStatus,
    source: item.source,
    submitterEmail: item.submitterEmail ?? null,
    submitterPhone: item.submitterPhone ?? null,
    submitter: item.submitterName
      ? { name: item.submitterName }
      : map.get(String(item.submitterUserId ?? "")) ?? null
  }));
}

export async function GET(request: Request) {
  try {
    const session = await requireCompanyFeedbackViewer();
    const rawLimit = Number(new URL(request.url).searchParams.get("limit") ?? "25");
    const limit = Number.isFinite(rawLimit) ? Math.min(50, Math.max(1, Math.floor(rawLimit))) : 25;

    const [customer, company] = await Promise.all([
      Feedback.find({
        source: { $in: ["CUSTOMER_BOOKING", "PUBLIC_EMBED"] },
        companyId: session.companyId
      })
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit)
        .select("_id source rating description createdAt reviewStatus submitterUserId submitterName submitterEmail submitterPhone")
        .lean(),
      Feedback.find({
        source: "COMPANY_PLATFORM",
        companyId: session.companyId
      })
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit)
        .select("_id source rating description createdAt reviewStatus submitterUserId submitterName submitterEmail submitterPhone")
        .lean()
    ]);

    return jsonOk({
      customerFeedback: await serialize(customer),
      companyFeedback: await serialize(company)
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "FEEDBACK_LIST_FAILED";
    return jsonError(code, code === "UNAUTHENTICATED" ? 401 : code === "FORBIDDEN" ? 403 : code === "PLAN_SUSPENDED" ? 423 : 500);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { session, companyId, workspaceId } = await requireCompanyFeedbackMember();
    const body = await request.json().catch(() => null) as {
      rating?: unknown;
      description?: unknown;
    } | null;
    const input = validateFeedbackInput(body?.rating, body?.description);

    const feedback = await withRedisLock(
      "feedback:company:" + session.companyId + ":" + session.userId,
      10_000,
      async () => {
        const recent = await Feedback.findOne({
          source: "COMPANY_PLATFORM",
          companyId,
          submitterUserId: session.userId,
          createdAt: { $gte: new Date(Date.now() - 10 * 60 * 1000) }
        }).select("_id").lean();

        if (recent) throw new Error("FEEDBACK_COOLDOWN_ACTIVE");

        return Feedback.create({
          source: "COMPANY_PLATFORM",
          companyId: new Types.ObjectId(companyId),
          workspaceId: new Types.ObjectId(workspaceId),
          submitterUserId: new Types.ObjectId(session.userId),
          rating: input.rating,
          description: input.description,
          submitterName: session.name || undefined,
          submitterEmail: session.email || undefined,
          submitterImage: session.image || undefined,
          reviewStatus: "NEW"
        });
      }
    );

    return jsonOk({ id: String(feedback._id), created: true }, 201);
  } catch (error) {
    const code = error instanceof Error ? error.message : "FEEDBACK_SUBMISSION_FAILED";
    const status =
      code === "CSRF_ORIGIN_INVALID" ? 403 :
      code === "UNAUTHENTICATED" ? 401 :
      code === "FORBIDDEN" ? 403 :
      code === "PLAN_SUSPENDED" ? 423 :
      code === "FEEDBACK_COOLDOWN_ACTIVE" ? 429 :
      code.includes("INVALID") || code.includes("TOO_LONG") ? 400 : 500;

    return jsonError(code, status);
  }
}


export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const { session, companyId } = await requireCompanyFeedbackMember();
    if (!["COMPANY_ADMIN"].includes(session.role)) return jsonError("FORBIDDEN", 403);

    const body = await request.json().catch(() => null) as { feedbackId?: unknown; reviewStatus?: unknown } | null;
    if (typeof body?.feedbackId !== "string" || !Types.ObjectId.isValid(body.feedbackId)) return jsonError("INVALID_FEEDBACK_ID", 400);
    if (body.reviewStatus !== "NEW" && body.reviewStatus !== "REVIEWED") return jsonError("INVALID_FEEDBACK_STATUS", 400);

    const item = await Feedback.findOne({ _id: new Types.ObjectId(body.feedbackId), companyId, source: "PUBLIC_EMBED" });
    if (!item) return jsonError("FEEDBACK_NOT_FOUND", 404);
    const current = item.reviewStatus as "NEW" | "REVIEWED" | "RESOLVED";
    if (!isValidFeedbackStatusTransition(current, body.reviewStatus)) return jsonError("INVALID_FEEDBACK_STATUS_TRANSITION", 400);

    item.reviewStatus = body.reviewStatus;
    item.reviewStatusChangedAt = new Date();
    item.reviewStatusChangedByUserId = new Types.ObjectId(session.userId);
    await item.save();
    return jsonOk({ id: String(item._id), reviewStatus: item.reviewStatus });
  } catch (error) {
    const code = error instanceof Error ? error.message : "FEEDBACK_STATUS_UPDATE_FAILED";
    const status = code === "CSRF_ORIGIN_INVALID" ? 403 : code === "UNAUTHENTICATED" ? 401 : code === "FORBIDDEN" ? 403 : code === "PLAN_SUSPENDED" ? 423 : code === "FEEDBACK_NOT_FOUND" ? 404 : 400;
    return jsonError(code, status);
  }
}
