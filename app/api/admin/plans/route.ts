import { Types } from "mongoose";
import { requirePlatformAdmin } from "@/lib/admin";
import { assertSameOrigin } from "@/lib/security";
import { jsonError, jsonOk } from "@/lib/http";
import {
  listPlansForAdmin,
  serializeAdminPlan,
  validatePlanDraft,
  PLAN_STATUSES,
  PLAN_DISCOUNT_TYPES
} from "@/lib/plan-catalog";
import { Plan } from "@/models/plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function statusFor(code: string) {
  if (code === "UNAUTHENTICATED") return 401;
  if (code === "FORBIDDEN" || code === "CSRF_ORIGIN_INVALID") return 403;
  if (code === "PLAN_IDENTIFIER_TAKEN") return 409;
  return 400;
}

export async function GET() {
  try {
    await requirePlatformAdmin();
    const items = await listPlansForAdmin();
    return jsonOk({ items: items.map(serializeAdminPlan) });
  } catch (error) {
    const code = error instanceof Error ? error.message : "PLAN_LIST_FAILED";
    return jsonError(code, statusFor(code));
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requirePlatformAdmin();
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return jsonError("INVALID_JSON", 400);

    const draft = validatePlanDraft({
      identifier: body.identifier,
      name: body.name,
      description: body.description,
      status: body.status ?? "PRIVATE",
      popular: body.popular ?? false,
      recommended: body.recommended ?? false,
      priceInr: body.priceInr,
      discountType: body.discountType ?? "NONE",
      discountValue: body.discountValue ?? 0,
      maxWorkspaces: body.maxWorkspaces,
      maxCompanies: body.maxCompanies,
      maxEmployees: body.maxEmployees,
      monthlyMeetingLimit: body.monthlyMeetingLimit,
      maxMeetingDurationMinutes: body.maxMeetingDurationMinutes,
      maxConcurrentMeetings: body.maxConcurrentMeetings,
      taskManagementEnabled: body.taskManagementEnabled ?? false,
      taskManagementDailyLimit: body.taskManagementDailyLimit === undefined ? 10 : body.taskManagementDailyLimit,
      vaultEnabled: body.vaultEnabled ?? false,
      vaultQuotaBytes: body.vaultQuotaBytes === undefined ? 5368709120 : body.vaultQuotaBytes,
      vaultMaxFileBytes: body.vaultMaxFileBytes === undefined ? 104857600 : body.vaultMaxFileBytes,
      vaultMaxItems: body.vaultMaxItems === undefined ? 1000 : body.vaultMaxItems,
      liveChatEnabled: body.liveChatEnabled ?? false,
      liveChatMonthlyLimit: body.liveChatMonthlyLimit === undefined ? 1000 : body.liveChatMonthlyLimit,
      liveChatCustomerLimit: body.liveChatCustomerLimit === undefined ? 500 : body.liveChatCustomerLimit,
      liveChatAgentLimit: body.liveChatAgentLimit === undefined ? 5 : body.liveChatAgentLimit,
      liveChatRetentionDays: body.liveChatRetentionDays === undefined ? 30 : body.liveChatRetentionDays,
      liveChatMessageCooldownSeconds: body.liveChatMessageCooldownSeconds === undefined ? 15 : body.liveChatMessageCooldownSeconds,
      liveChatPdfExportEnabled: body.liveChatPdfExportEnabled === undefined ? true : body.liveChatPdfExportEnabled,
      liveChatDeleteEnabled: body.liveChatDeleteEnabled === undefined ? true : body.liveChatDeleteEnabled,
      validityDays: body.validityDays,
      freeFeatureDays: body.freeFeatureDays ?? null
    });

    if (draft.status === "PUBLIC" && draft.priceInr < 0) {
      return jsonError("PLAN_PRICE_INVALID", 400);
    }

    const existing = await Plan.exists({ identifier: draft.identifier });
    if (existing) return jsonError("PLAN_IDENTIFIER_TAKEN", 409);

    const item = await Plan.create({
      identifier: draft.identifier,
      name: draft.name,
      description: draft.description,
      status: draft.status,
      popular: draft.popular,
      recommended: draft.recommended,
      priceInr: draft.priceInr,
      discountType: draft.discountType,
      discountValue: draft.discountValue,
      maxWorkspaces: draft.maxWorkspaces,
      maxCompanies: draft.maxCompanies,
      maxEmployees: draft.maxEmployees,
      monthlyMeetingLimit: draft.monthlyMeetingLimit,
      maxMeetingDurationMinutes: draft.maxMeetingDurationMinutes,
      maxConcurrentMeetings: draft.maxConcurrentMeetings,
      taskManagementEnabled: draft.taskManagementEnabled,
      taskManagementDailyLimit: draft.taskManagementDailyLimit,
      vaultEnabled: draft.vaultEnabled,
      vaultQuotaBytes: draft.vaultQuotaBytes,
      vaultMaxFileBytes: draft.vaultMaxFileBytes,
      vaultMaxItems: draft.vaultMaxItems,
      liveChatEnabled: draft.liveChatEnabled,
      liveChatMonthlyLimit: draft.liveChatMonthlyLimit,
      liveChatCustomerLimit: draft.liveChatCustomerLimit,
      liveChatAgentLimit: draft.liveChatAgentLimit,
      liveChatRetentionDays: draft.liveChatRetentionDays,
      liveChatMessageCooldownSeconds: draft.liveChatMessageCooldownSeconds,
      liveChatPdfExportEnabled: draft.liveChatPdfExportEnabled,
      liveChatDeleteEnabled: draft.liveChatDeleteEnabled,
      validityDays: draft.validityDays,
      freeFeatureDays: draft.freeFeatureDays,
      requiresPayment: draft.requiresPayment,
      revision: 1,
      sortOrder: 1000,
      archivedAt: null,
      createdByUserId: new Types.ObjectId(session.userId),
      updatedByUserId: new Types.ObjectId(session.userId)
    });

    const plan = await listPlansForAdmin().then((items) => items.find((row) => row.id === draft.identifier));
    if (!plan) throw new Error("PLAN_CREATE_FAILED");

    const serialized = serializeAdminPlan(plan);
    const { PlatformAuditEvent } = await import("@/models/platform-audit-event");
    await PlatformAuditEvent.create({
      actorUserId: new Types.ObjectId(session.userId),
      entityType: "PLAN",
      entityId: item._id,
      action: "CREATE",
      details: {
        after: serialized,
        identifier: draft.identifier
      }
    });

    return jsonOk(serialized, 201);
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && (error as { code?: unknown }).code === 11000) {
      return jsonError("PLAN_IDENTIFIER_TAKEN", 409);
    }
    const code = error instanceof Error ? error.message : "PLAN_CREATE_FAILED";
    return jsonError(code, statusFor(code));
  }
}

void PLAN_STATUSES;
void PLAN_DISCOUNT_TYPES;
