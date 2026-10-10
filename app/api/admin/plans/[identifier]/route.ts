import { Types } from "mongoose";
import { requirePlatformAdmin } from "@/lib/admin";
import { assertSameOrigin } from "@/lib/security";
import { jsonError, jsonOk } from "@/lib/http";
import {
  getManagedPlan,
  listPlansForAdmin,
  serializeAdminPlan,
  validatePlanDraft
} from "@/lib/plan-catalog";
import { Plan } from "@/models/plan";
import { Subscription } from "@/models/subscription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHECKOUT_CONFIG_KEYS = [
  "priceInr",
  "discountType",
  "discountValue",
  "maxWorkspaces",
  "maxCompanies",
  "maxEmployees",
  "monthlyMeetingLimit",
  "maxMeetingDurationMinutes",
  "maxConcurrentMeetings",
  "taskManagementEnabled",
  "taskManagementDailyLimit",
  "vaultEnabled",
  "vaultQuotaBytes",
  "vaultMaxFileBytes",
  "vaultMaxItems",
  "validityDays",
  "freeFeatureDays",
  "requiresPayment",
  "status"
] as const;

function statusFor(code: string) {
  if (code === "UNAUTHENTICATED") return 401;
  if (code === "FORBIDDEN" || code === "CSRF_ORIGIN_INVALID") return 403;
  if (code === "PLAN_NOT_FOUND") return 404;
  if (code === "PLAN_ARCHIVED" || code === "PLAN_IDENTIFIER_IMMUTABLE" || code === "PLAN_CONFIGURATION_INVALID") return 409;
  return 400;
}

function changedKeys(before: Record<string, unknown>, after: Record<string, unknown>) {
  return Object.keys(after).filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ identifier: string }> }
) {
  try {
    await requirePlatformAdmin();
    const { identifier } = await params;
    const item = await getManagedPlan(identifier, { includeArchived: true });
    if (!item) return jsonError("PLAN_NOT_FOUND", 404);

    const full = await listPlansForAdmin();
    const plan = full.find((row) => row.id === item.id);
    if (!plan) return jsonError("PLAN_NOT_FOUND", 404);

    return jsonOk(serializeAdminPlan(plan));
  } catch (error) {
    const code = error instanceof Error ? error.message : "PLAN_READ_FAILED";
    return jsonError(code, statusFor(code));
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ identifier: string }> }
) {
  try {
    assertSameOrigin(request);
    const session = await requirePlatformAdmin();
    const { identifier } = await params;

    const current = await getManagedPlan(identifier, { includeArchived: true });
    if (!current) return jsonError("PLAN_NOT_FOUND", 404);

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return jsonError("INVALID_JSON", 400);

    if (body.identifier !== undefined && String(body.identifier).trim().toLowerCase() !== current.id) {
      return jsonError("PLAN_IDENTIFIER_IMMUTABLE", 409);
    }

    const archived = body.archived;
    if (archived !== undefined && typeof archived !== "boolean") {
      return jsonError("PLAN_ARCHIVE_VALUE_INVALID", 400);
    }

    const draft = validatePlanDraft({
      identifier: current.id,
      name: body.name ?? current.name,
      description: body.description ?? current.description,
      status: body.status ?? current.status,
      popular: body.popular ?? current.popular,
      recommended: body.recommended ?? current.recommended,
      priceInr: body.priceInr ?? current.priceInr,
      discountType: body.discountType ?? current.discountType,
      discountValue: body.discountValue ?? current.discountValue,
      maxWorkspaces: body.maxWorkspaces ?? current.maxWorkspaces,
      maxCompanies: body.maxCompanies ?? current.maxCompanies,
      maxEmployees: body.maxEmployees ?? current.maxEmployees,
      monthlyMeetingLimit: body.monthlyMeetingLimit ?? current.monthlyMeetingLimit,
      maxMeetingDurationMinutes: body.maxMeetingDurationMinutes ?? current.maxMeetingDurationMinutes,
      maxConcurrentMeetings: body.maxConcurrentMeetings ?? current.maxConcurrentMeetings,
      taskManagementEnabled: body.taskManagementEnabled === undefined ? current.taskManagementEnabled : body.taskManagementEnabled,
      taskManagementDailyLimit:
        body.taskManagementDailyLimit === undefined
          ? current.taskManagementDailyLimit
          : body.taskManagementDailyLimit,
      vaultEnabled: body.vaultEnabled === undefined ? current.vaultEnabled : body.vaultEnabled,
      vaultQuotaBytes: body.vaultQuotaBytes ?? current.vaultQuotaBytes,
      vaultMaxFileBytes: body.vaultMaxFileBytes ?? current.vaultMaxFileBytes,
      vaultMaxItems: body.vaultMaxItems ?? current.vaultMaxItems,
      validityDays: body.validityDays ?? current.validityDays,
      freeFeatureDays: body.freeFeatureDays === undefined ? current.freeFeatureDays : body.freeFeatureDays
    });

    if (archived === false && draft.status === "PUBLIC" && current.archivedAt) {
      // Explicit unarchive is allowed; public status is restored only after this deliberate action.
    }

    const afterDraft = {
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
      validityDays: draft.validityDays,
      freeFeatureDays: draft.freeFeatureDays,
      requiresPayment: draft.requiresPayment
    };

    const before = {
      name: current.name,
      description: current.description,
      status: current.status,
      popular: current.popular,
      recommended: current.recommended,
      priceInr: current.priceInr,
      discountType: current.discountType,
      discountValue: current.discountValue,
      maxWorkspaces: current.maxWorkspaces,
      maxCompanies: current.maxCompanies,
      maxEmployees: current.maxEmployees,
      monthlyMeetingLimit: current.monthlyMeetingLimit,
      maxMeetingDurationMinutes: current.maxMeetingDurationMinutes,
      maxConcurrentMeetings: current.maxConcurrentMeetings,
      taskManagementEnabled: current.taskManagementEnabled,
      taskManagementDailyLimit: current.taskManagementDailyLimit,
      vaultEnabled: current.vaultEnabled,
      vaultQuotaBytes: current.vaultQuotaBytes,
      vaultMaxFileBytes: current.vaultMaxFileBytes,
      vaultMaxItems: current.vaultMaxItems,
      validityDays: current.validityDays,
      freeFeatureDays: current.freeFeatureDays,
      requiresPayment: current.requiresPayment,
      archivedAt: current.archivedAt
    };

    const nextArchivedAt =
      archived === true ? new Date() :
      archived === false ? null :
      current.archivedAt;

    if (draft.status === "PUBLIC" && nextArchivedAt) {
      return jsonError("PLAN_ARCHIVED", 409);
    }

    const after = { ...afterDraft, archivedAt: nextArchivedAt };
    const changed = changedKeys(before, after);
    const checkoutConfigChanged = changed.some((key) =>
      (CHECKOUT_CONFIG_KEYS as readonly string[]).includes(key)
    );

    const activeSubscriptionCount = await Subscription.countDocuments({
      planId: current.id,
      status: "ACTIVE",
      currentPeriodEnd: { $gt: new Date() }
    });

    const update: Record<string, unknown> = {
      ...afterDraft,
      archivedAt: nextArchivedAt,
      updatedByUserId: new Types.ObjectId(session.userId)
    };

    const updated = await Plan.findOneAndUpdate(
      { identifier: current.id },
      checkoutConfigChanged
        ? { $set: update, $inc: { revision: 1 } }
        : { $set: update },
      { returnDocument: "after", runValidators: true }
    ).lean();

    if (!updated) return jsonError("PLAN_NOT_FOUND", 404);

    const full = await listPlansForAdmin();
    const plan = full.find((row) => row.id === current.id);
    if (!plan) return jsonError("PLAN_NOT_FOUND", 404);

    const { PlatformAuditEvent } = await import("@/models/platform-audit-event");
    const statusChanged = before.status !== after.status;
    const archiveChanged = Boolean(before.archivedAt) !== Boolean(after.archivedAt);
    const action =
      archiveChanged
        ? (after.archivedAt ? "ARCHIVE" : "UNARCHIVE")
        : statusChanged
          ? (after.status === "PUBLIC" ? "PUBLISH" : "UNPUBLISH")
          : "UPDATE";

    await PlatformAuditEvent.create({
      actorUserId: new Types.ObjectId(session.userId),
      entityType: "PLAN",
      entityId: updated._id,
      action,
      details: {
        identifier: current.id,
        activeSubscriptionCount,
        changedKeys: changed,
        before,
        after
      }
    });

    return jsonOk(serializeAdminPlan(plan));
  } catch (error) {
    const code = error instanceof Error ? error.message : "PLAN_UPDATE_FAILED";
    return jsonError(code, statusFor(code));
  }
}
