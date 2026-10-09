import { getMongo } from "@/lib/mongodb";
import { getSession, updateSessionScope } from "@/lib/session";
import { Company } from "@/models/company";
import { Workspace } from "@/models/workspace";
import { Membership } from "@/models/membership";
import { Subscription } from "@/models/subscription";
import { MeetingType } from "@/models/meeting-type";
import { AvailabilityRule } from "@/models/availability-rule";
import { User } from "@/models/user";
import { slugify } from "@/lib/slug";
import { jsonError, jsonOk } from "@/lib/http";
import { assertSameOrigin } from "@/lib/security";
import { isGoogleSchedulingReady } from "@/lib/google-scheduling";
import { invoiceTaxConfig } from "@/lib/invoicing";
import { listPublicPlans, getManagedPlan, createEntitlementSnapshot } from "@/lib/plan-catalog";
import { GoogleAccount } from "@/models/google-account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CompanyAddress = {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
};

function cleanAddress(address?: CompanyAddress) {
  if (!address) return undefined;
  return {
    line1: address.line1?.trim().slice(0, 200) || "",
    line2: address.line2?.trim().slice(0, 200) || "",
    city: address.city?.trim().slice(0, 100) || "",
    state: address.state?.trim().slice(0, 100) || "",
    postalCode: address.postalCode?.trim().slice(0, 30) || "",
    country: address.country?.trim().slice(0, 100) || ""
  };
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function cleanPhone(value: string) {
  return value.replace(/[^0-9+]/g, "").trim();
}

function profilePayload(company: {
  _id: unknown;
  name: string;
  slug: string;
  email?: string;
  phone?: string;
  logoUrl?: string;
  websiteUrl?: string;
  description?: string;
  address?: CompanyAddress;
  taxId?: string;
  publicBookingEnabled: boolean;
}, owner?: { name?: string; email?: string; image?: string }) {
  const email = company.email ?? "";
  const phone = company.phone ?? "";
  return {
    id: String(company._id),
    name: company.name,
    slug: company.slug,
    email,
    phone,
    logoUrl: company.logoUrl ?? "",
    websiteUrl: company.websiteUrl ?? "",
    description: company.description ?? "",
    address: {
      line1: company.address?.line1 ?? "",
      line2: company.address?.line2 ?? "",
      city: company.address?.city ?? "",
      state: company.address?.state ?? "",
      postalCode: company.address?.postalCode ?? "",
      country: company.address?.country ?? ""
    },
    taxId: company.taxId ?? "",
    publicBookingEnabled: company.publicBookingEnabled,
    profileComplete: Boolean(company.name && isValidEmail(email) && phone.length >= 8),
    owner: owner
      ? { name: owner.name ?? "", email: owner.email ?? "", image: owner.image ?? "" }
      : null
  };
}

async function getScopedCompany(session: Awaited<ReturnType<typeof getSession>>) {
  if (!session) return null;
  if (session.companyId && ["COMPANY_OWNER", "COMPANY_ADMIN", "EMPLOYEE"].includes(session.role)) {
    const membership = await Membership.findOne({
      companyId: session.companyId,
      userId: session.userId,
      active: true
    }).lean();
    if (!membership) return null;
  }
  if (session.role === "PLATFORM_ADMIN" && session.companyId) {
    return Company.findById(session.companyId).lean();
  }

  return session.companyId
    ? Company.findById(session.companyId).lean()
    : Company.findOne({ ownerUserId: session.userId }).lean();
}

export async function GET() {
  const session = await getSession();
  if (!session) return jsonError("UNAUTHENTICATED", 401);

  await getMongo();
  const company = await getScopedCompany(session);
  if (!company) return jsonOk(null);

  const subscriptionPromise = import("@/lib/plans-server").then(({ getCompanySubscription }) =>
    getCompanySubscription(String(company._id))
  );
  const [workspace, subscription, activeMembers, owner, taxConfig, availablePlans] = await Promise.all([
    Workspace.findOne({ companyId: company._id }).lean(),
    subscriptionPromise,
    Membership.find({
      companyId: company._id,
      active: true,
      role: { $in: ["COMPANY_OWNER", "COMPANY_ADMIN", "EMPLOYEE"] }
    }).select("userId").lean(),
    User.findById(company.ownerUserId).select("name email image").lean(),
    invoiceTaxConfig(),
    listPublicPlans()
  ]);

  const currentEntitlements = await import("@/lib/plans-server").then(({ getCompanyEntitlements }) =>
    getCompanyEntitlements(String(company._id))
  );
  const currentCatalogPlan = await getManagedPlan(subscription.planId, { includeArchived: true });

  const connectedAccounts = await GoogleAccount.find({
    userId: { $in: activeMembers.map((member) => member.userId) },
    status: "CONNECTED"
  }).select("userId status scopes").lean();

  const connectedMemberCount = connectedAccounts.filter(isGoogleSchedulingReady).length;
  const memberCount = activeMembers.length;
  const freeFeatureEndsAt = subscription.planId === "free"
    ? new Date(
        subscription.currentPeriodStart.getTime() +
          (currentEntitlements.freeFeatureDays ?? 14) * 24 * 60 * 60 * 1000
      )
    : null;
  const featureLocked = Boolean(freeFeatureEndsAt && freeFeatureEndsAt.getTime() <= Date.now());

  return jsonOk({
    company: profilePayload(company, owner ?? undefined),
    workspace: workspace
      ? {
          id: String(workspace._id),
          name: workspace.name,
          timezone: workspace.timezone,
          // Subscription is the source of truth for entitlement state.
          planId: subscription.planId
        }
      : null,
    currentPlan: {
      ...currentEntitlements,
      description: currentCatalogPlan?.description ?? "",
      status: currentCatalogPlan?.status ?? "PRIVATE",
      popular: currentCatalogPlan?.popular ?? false,
      recommended: currentCatalogPlan?.recommended ?? false,
      discountType: "NONE",
      discountValue: 0,
      discountAmountInr: 0,
      finalPriceInr: currentEntitlements.priceInr
    },
    availablePlans: availablePlans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      description: plan.description,
      status: plan.status,
      popular: plan.popular,
      recommended: plan.recommended,
      priceInr: plan.priceInr,
      discountType: plan.discountType,
      discountValue: plan.discountValue,
      discountAmountInr: plan.discountAmountInr,
      finalPriceInr: plan.finalPriceInr,
      maxWorkspaces: plan.maxWorkspaces,
      maxCompanies: plan.maxCompanies,
      maxEmployees: plan.maxEmployees,
      monthlyMeetingLimit: plan.monthlyMeetingLimit,
      maxMeetingDurationMinutes: plan.maxMeetingDurationMinutes,
      maxConcurrentMeetings: plan.maxConcurrentMeetings,
      validityDays: plan.validityDays,
      freeFeatureDays: plan.freeFeatureDays,
      requiresPayment: plan.requiresPayment
    })),
    subscription: subscription
      ? {
          planId: subscription.planId,
          status: subscription.status,
          monthlyMeetingsUsed: subscription.monthlyMeetingsUsed,
          source: subscription.source,
          freeUsageDates: subscription.freeUsageDates ?? [],
          periodStart: subscription.currentPeriodStart,
          periodEnd: subscription.currentPeriodEnd
        }
      : null,
    memberCount,
    connectedMemberCount,
    canPublish: connectedMemberCount > 0,
    gstRatePercent: taxConfig.ratePercent,
    gstEnabled: taxConfig.enabled,
    gstInclusive: taxConfig.inclusive,
    featureLocked,
    freeFeatureEndsAt,
    currentRole: session.role
  });
}

export async function POST(request: Request) {
  assertSameOrigin(request);
  const session = await getSession();
  if (!session) return jsonError("UNAUTHENTICATED", 401);
  if (!["COMPANY_OWNER", "PLATFORM_ADMIN"].includes(session.role)) return jsonError("FORBIDDEN", 403);

  await getMongo();
  const existing = await Company.findOne({ ownerUserId: session.userId }).lean();
  if (existing) return jsonError("COMPANY_ALREADY_EXISTS", 409);

  let body: {
    name?: string;
    slug?: string;
    email?: string;
    phone?: string;
    description?: string;
    timezone?: string;
  };
  try {
    body = await request.json();
  } catch {
    return jsonError("INVALID_JSON");
  }

  const name = body.name?.trim();
  const email = body.email?.trim().toLowerCase();
  const phone = cleanPhone(body.phone ?? "");
  if (!name || name.length < 2 || name.length > 100) return jsonError("INVALID_COMPANY_NAME");
  if (!email || !isValidEmail(email)) return jsonError("INVALID_COMPANY_EMAIL");
  if (phone.length < 8 || phone.length > 18) return jsonError("INVALID_COMPANY_PHONE");

  const slug = slugify(body.slug?.trim() || name);
  const collision = await Company.findOne({ slug }).lean();
  if (collision) return jsonError("COMPANY_SLUG_TAKEN", 409);

  const freePlan = await getManagedPlan("free", { includeArchived: true });
  if (!freePlan) return jsonError("FREE_PLAN_NOT_CONFIGURED", 503);
  if (freePlan.archivedAt || freePlan.status !== "PUBLIC" || freePlan.requiresPayment) {
    return jsonError("FREE_PLAN_UNAVAILABLE", 409);
  }

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setDate(periodEnd.getDate() + freePlan.validityDays);

  const db = await getMongo();
  const tx = await db.startSession();
  try {
    const createdIds = await tx.withTransaction(async () => {
      const [company] = await Company.create([{
        name,
        slug,
        email,
        phone,
        description: body.description?.trim().slice(0, 1200),
        ownerUserId: session.userId
      }], { session: tx });

      const [workspace] = await Workspace.create([{
        companyId: company._id,
        name: `${name} workspace`,
        timezone: body.timezone || "Asia/Kolkata",
        planId: "free"
      }], { session: tx });

      await Subscription.create([{
        companyId: company._id,
        planId: freePlan.id,
        entitlementSnapshot: createEntitlementSnapshot(freePlan),
        source: "FREE",
        status: "ACTIVE",
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        monthlyMeetingsUsed: 0
      }], { session: tx });

      await Membership.create([{
        companyId: company._id,
        workspaceId: workspace._id,
        userId: session.userId,
        role: "COMPANY_OWNER",
        active: true,
        googleConnectionStatus: "DISCONNECTED"
      }], { session: tx });

      await MeetingType.create([{
        companyId: company._id,
        workspaceId: workspace._id,
        name: "General meeting",
        slug: "general",
        durationOptionsMinutes: [5]
      }], { session: tx });

      const rules = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
        companyId: company._id,
        employeeId: session.userId,
        dayOfWeek,
        startMinute: 9 * 60,
        endMinute: 17 * 60,
        timezone: body.timezone || "Asia/Kolkata",
        active: true
      }));
      await AvailabilityRule.insertMany(rules, { session: tx });

      return { companyId: String(company._id), workspaceId: String(workspace._id) };
    });

    if (!createdIds) throw new Error("COMPANY_CREATE_FAILED");
    await updateSessionScope(session.userId, createdIds);

    const ownerGoogleAccount = await GoogleAccount.findOne({
      userId: session.userId,
      status: "CONNECTED"
    }).select("status scopes").lean();

    if (isGoogleSchedulingReady(ownerGoogleAccount)) {
      await Membership.updateOne(
        { companyId: createdIds.companyId, userId: session.userId, active: true },
        { $set: { googleConnectionStatus: "CONNECTED" } }
      );
      await Company.updateOne(
        { _id: createdIds.companyId },
        { $set: { publicBookingEnabled: true } }
      );
    }

    return jsonOk({ companyId: createdIds.companyId, workspaceId: createdIds.workspaceId, slug }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "COMPANY_CREATE_FAILED";
    return jsonError(message, 500);
  } finally {
    await tx.endSession();
  }
}

export async function PATCH(request: Request) {
  assertSameOrigin(request);
  const session = await getSession();
  if (!session) return jsonError("UNAUTHENTICATED", 401);
  if (!["COMPANY_OWNER", "COMPANY_ADMIN", "PLATFORM_ADMIN"].includes(session.role)) return jsonError("FORBIDDEN", 403);
  if (!session.companyId) return jsonError("COMPANY_NOT_CONFIGURED", 400);

  await getMongo();
  const membership = await Membership.findOne({
    companyId: session.companyId,
    userId: session.userId,
    active: true,
    role: { $in: ["COMPANY_OWNER", "COMPANY_ADMIN"] }
  }).lean();
  if (!membership && session.role !== "PLATFORM_ADMIN") return jsonError("FORBIDDEN", 403);

  const body = await request.json().catch(() => null) as {
    publicBookingEnabled?: boolean;
    name?: string;
    slug?: string;
    email?: string;
    phone?: string;
    logoUrl?: string;
    websiteUrl?: string;
    description?: string;
    taxId?: string;
    address?: CompanyAddress;
  } | null;

  const current = await Company.findById(session.companyId).lean();
  if (!current) return jsonError("COMPANY_NOT_FOUND", 404);

  const update: Record<string, unknown> = {};

  if (typeof body?.name === "string") {
    const name = body.name.trim();
    if (name.length < 2 || name.length > 100) return jsonError("INVALID_COMPANY_NAME", 400);
    update.name = name;
  }

  if (typeof body?.slug === "string") {
    const slug = slugify(body.slug);
    if (!slug) return jsonError("INVALID_COMPANY_SLUG", 400);
    const collision = await Company.findOne({ slug, _id: { $ne: session.companyId } }).lean();
    if (collision) return jsonError("COMPANY_SLUG_TAKEN", 409);
    update.slug = slug;
  }

  if (typeof body?.email === "string") {
    const email = body.email.trim().toLowerCase();
    if (!isValidEmail(email)) return jsonError("INVALID_COMPANY_EMAIL", 400);
    update.email = email;
  }

  if (typeof body?.phone === "string") {
    const phone = cleanPhone(body.phone);
    if (phone.length < 8 || phone.length > 18) return jsonError("INVALID_COMPANY_PHONE", 400);
    update.phone = phone;
  }

  if (typeof body?.logoUrl === "string") update.logoUrl = body.logoUrl.trim().slice(0, 2000);
  if (typeof body?.websiteUrl === "string") update.websiteUrl = body.websiteUrl.trim().slice(0, 500);
  if (typeof body?.description === "string") update.description = body.description.trim().slice(0, 1200);
  if (typeof body?.taxId === "string") update.taxId = body.taxId.trim().slice(0, 80);

  const address = cleanAddress(body?.address);
  if (address) update.address = address;

  if (typeof body?.publicBookingEnabled === "boolean") {
    if (body.publicBookingEnabled) {
      const { assertFeatureAccess } = await import("@/lib/plans-server");
      try {
        await assertFeatureAccess(session.companyId);
      } catch (error) {
        return jsonError(error instanceof Error ? error.message : "FREE_FEATURE_DAYS_EXHAUSTED", 409);
      }
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

  const company = await Company.findOneAndUpdate(
    { _id: session.companyId },
    { $set: update },
    { new: true }
  ).lean();

  if (!company) return jsonError("COMPANY_NOT_FOUND", 404);

  if (session.role === "COMPANY_OWNER" && update.slug) {
    await updateSessionScope(session.userId, { companyId: String(company._id), workspaceId: session.workspaceId });
  }

  const owner = await User.findById(company.ownerUserId).select("name email image").lean();
  return jsonOk({ company: profilePayload(company, owner ?? undefined) });
}
