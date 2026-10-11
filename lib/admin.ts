import { Types } from "mongoose";
import { getMongo } from "@/lib/mongodb";
import { getSession } from "@/lib/session";
import { Company } from "@/models/company";
import { User } from "@/models/user";
import { Membership } from "@/models/membership";
import { Subscription } from "@/models/subscription";
import { Payment } from "@/models/payment";
import { Meeting } from "@/models/meeting";
import { BookingRequest } from "@/models/booking-request";
import { Task } from "@/models/task";
import { TaskAssignment } from "@/models/task-assignment";
import { Invoice } from "@/models/invoice";
import { GoogleAccount } from "@/models/google-account";
import type { PlanEntitlements } from "@/lib/plans";
import type { AdminPlan } from "@/lib/plan-catalog";
import { ensurePlanCatalog, listPlansForAdmin } from "@/lib/plan-catalog";
import { Plan } from "@/models/plan";
import { ensureInvoicesForCapturedPayments } from "@/lib/billing";
import { getAdminVaultUsage, type AdminVaultUsageItem } from "@/lib/admin-vault-usage";
import { VaultFile } from "@/models/vault-file";
import { VaultFolder } from "@/models/vault-folder";
import { VaultUpload } from "@/models/vault-upload";

export type AdminCompanyListItem = {
  id: string;
  name: string;
  slug: string;
  email: string;
  phone: string;
  publicBookingEnabled: boolean;
  createdAt: Date;
  owner: { id: string; name: string; email: string } | null;
  planId: string | null;
  planName: string;
  periodEnd: Date | null;
  planLimit: number;
  monthlyMeetingsUsed: number;
  meetingsRemaining: number;
  employees: number;
  meetingUsers: number;
  totalMeetings: number;
  completedMeetings: number;
  totalTasks: number;
  activeTasks: number;
  completedTasks: number;
  overdueTasks: number;
  totalTaskAssignments: number;
  totalPayments: number;
  paymentCount: number;
  lastPaymentAt: Date | null;
  vaultUsage?: AdminVaultUsageItem | null;
};

export type AdminCompanyDetails = AdminCompanyListItem & {
  description: string;
  websiteUrl: string;
  taxId: string;
  address: {
    line1: string;
    line2: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  owner: { id: string; name: string; email: string; image: string } | null;
  activeMembers: Array<{
    id: string;
    name: string;
    email: string;
    image: string;
    role: string;
    googleConnected: boolean;
  }>;
  meetingRequestCounts: Record<string, number>;
  meetingStatusCounts: Record<string, number>;
  customers: number;
  recentPayments: Array<{
    id: string;
    planId: string;
    status: string;
    amount: number;
    currency: string;
    providerOrderId: string;
    providerPaymentId: string | null;
    paidAt: Date | null;
  }>;
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    planId: string;
    amount: number;
    currency: string;
    issuedAt: Date;
    isCurrentPlan: boolean;
    gstAmount: number;
    gstRatePercent: number;
    source: string;
  }>;
  recentMeetings: Array<{
    id: string;
    startAt: Date;
    endAt: Date;
    status: string;
    employee: { name: string; email: string } | null;
    customer: { name: string; email: string } | null;
  }>;
  plans: Record<string, AdminPlan>;
  alternativePlanId: string | null;
  planSuspended: boolean;
  planSuspendedAt: Date | null;
  vaultUsage: AdminVaultUsageItem;
  vaultFolderCount: number;
  vaultFiles: Array<{
    id: string;
    name: string;
    mimeType: string;
    originalSizeBytes: number;
    storedBytes: number;
    folderName: string;
    createdAt: Date;
    uploadedBy: { name: string; email: string } | null;
  }>;
  activeVaultUploads: Array<{
    id: string;
    name: string;
    reservedBytes: number;
    receivedChunks: number;
    expectedChunks: number;
    status: "OPEN" | "COMPLETING";
    expiresAt: Date;
    createdAt: Date;
  }>;
};

export type AdminUserListItem = {
  id: string;
  name: string;
  email: string;
  image: string;
  createdAt: Date;
  lastLoginAt: Date | null;
  companyIds: string[];
  companies: string[];
  totalRequests: number;
  totalMeetings: number;
  completedMeetings: number;
  cancelledMeetings: number;
  lastBookingAt: Date | null;
};

export async function requirePlatformAdmin() {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHENTICATED");
  if (session.role !== "PLATFORM_ADMIN") throw new Error("FORBIDDEN");
  await getMongo();
  return session;
}

function toMoneyMinor(value: number | undefined) {
  return Number.isFinite(value ?? NaN) ? Number(value) : 0;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function buildCompanyRows(
  companies: Array<{
    _id: Types.ObjectId;
    name: string;
    slug: string;
    email?: string;
    phone?: string;
    publicBookingEnabled?: boolean;
    createdAt: Date;
    ownerUserId: Types.ObjectId;
  }>
): Promise<AdminCompanyListItem[]> {
  const ids = companies.map((item) => item._id);
  if (!ids.length) return [];

  const [owners, subscriptions, memberAgg, paymentAgg, meetingAgg, requestAgg, taskAgg, taskAssignmentAgg] = await Promise.all([
    User.find({ _id: { $in: companies.map((item) => item.ownerUserId) } }).select("name email").lean(),
    Subscription.find({ companyId: { $in: ids } }).lean(),
    Membership.aggregate<{ _id: Types.ObjectId; employees: number }>([
      { $match: { companyId: { $in: ids }, active: true, role: "EMPLOYEE" } },
      { $group: { _id: "$companyId", employees: { $sum: 1 } } }
    ]),
    Payment.aggregate<{ _id: Types.ObjectId; totalPayments: number; paymentCount: number; lastPaymentAt: Date | null }>([
      { $match: { companyId: { $in: ids }, status: "CAPTURED" } },
      { $group: {
        _id: "$companyId",
        totalPayments: { $sum: "$amount" },
        paymentCount: { $sum: 1 },
        lastPaymentAt: { $max: "$paidAt" }
      } }
    ]),
    Meeting.aggregate<{ _id: Types.ObjectId; totalMeetings: number; completedMeetings: number }>([
      { $match: { companyId: { $in: ids } } },
      { $group: {
        _id: "$companyId",
        totalMeetings: { $sum: 1 },
        completedMeetings: { $sum: { $cond: [{ $eq: ["$status", "COMPLETED"] }, 1, 0] } }
      } }
    ]),
    BookingRequest.aggregate<{ _id: Types.ObjectId; meetingUsers: number }>([
      { $match: { companyId: { $in: ids } } },
      { $group: { _id: "$companyId", customers: { $addToSet: "$customerId" } } },
      { $project: { _id: 1, meetingUsers: { $size: "$customers" } } }
    ]),
    Task.aggregate<{
      _id: Types.ObjectId;
      totalTasks: number;
      activeTasks: number;
      completedTasks: number;
      overdueTasks: number;
    }>([
      { $match: { companyId: { $in: ids } } },
      { $group: {
        _id: "$companyId",
        totalTasks: { $sum: 1 },
        activeTasks: { $sum: { $cond: [{ $in: ["$status", ["TODO", "IN_PROGRESS", "BLOCKED", "IN_REVIEW"]] }, 1, 0] } },
        completedTasks: { $sum: { $cond: [{ $eq: ["$status", "COMPLETED"] }, 1, 0] } },
        overdueTasks: { $sum: { $cond: [{ $and: [
          { $ne: ["$dueAt", null] },
          { $lt: ["$dueAt", new Date()] },
          { $not: [{ $in: ["$status", ["COMPLETED", "CANCELLED"]] }] }
        ] }, 1, 0] } }
      } }
    ]),
    TaskAssignment.aggregate<{ _id: Types.ObjectId; totalTaskAssignments: number }>([
      { $match: { companyId: { $in: ids } } },
      { $group: { _id: "$companyId", totalTaskAssignments: { $sum: 1 } } }
    ])
  ]);

  const ownerMap = new Map(owners.map((item) => [String(item._id), item]));
  const subscriptionMap = new Map(subscriptions.map((item) => [String(item.companyId), item]));
  const employeeMap = new Map(memberAgg.map((item) => [String(item._id), item.employees]));
  const paymentMap = new Map(paymentAgg.map((item) => [String(item._id), item]));
  const meetingMap = new Map(meetingAgg.map((item) => [String(item._id), item]));
  await ensurePlanCatalog();
  const planDocs = await Plan.find({ identifier: { $in: [...new Set(subscriptions.map((item) => item.planId))] } })
    .select("identifier name monthlyMeetingLimit")
    .lean();
  const planNameMap = new Map(planDocs.map((item) => [String(item.identifier), item.name]));
  const planLimitMap = new Map(planDocs.map((item) => [String(item.identifier), Number(item.monthlyMeetingLimit ?? 0)]));
  const requestMap = new Map(requestAgg.map((item) => [String(item._id), item.meetingUsers]));
  const taskMap = new Map(taskAgg.map((item) => [String(item._id), item]));
  const taskAssignmentMap = new Map(taskAssignmentAgg.map((item) => [String(item._id), item.totalTaskAssignments]));

  return companies.map((company) => {
    const id = String(company._id);
    const subscription = subscriptionMap.get(id);
    const planName = subscription?.planId ? planNameMap.get(String(subscription.planId)) : undefined;
    const monthlyUsed = subscription?.monthlyMeetingsUsed ?? 0;
    const planLimit = subscription?.entitlementSnapshot?.monthlyMeetingLimit ?? (subscription?.planId ? planLimitMap.get(String(subscription.planId)) ?? 0 : 0);

    return {
      id,
      name: company.name,
      slug: company.slug,
      email: company.email ?? "",
      phone: company.phone ?? "",
      publicBookingEnabled: Boolean(company.publicBookingEnabled),
      createdAt: company.createdAt,
      owner: (() => {
        const owner = ownerMap.get(String(company.ownerUserId));
        return owner ? { id: String(owner._id), name: owner.name, email: owner.email } : null;
      })(),
      planId: subscription?.planId ?? null,
      planName: planName ?? "No plan",
      periodEnd: subscription?.currentPeriodEnd ?? null,
      planLimit,
      monthlyMeetingsUsed: monthlyUsed,
      meetingsRemaining: Math.max(0, planLimit - monthlyUsed),
      employees: employeeMap.get(id) ?? 0,
      meetingUsers: requestMap.get(id) ?? 0,
      totalMeetings: meetingMap.get(id)?.totalMeetings ?? 0,
      completedMeetings: meetingMap.get(id)?.completedMeetings ?? 0,
      totalTasks: taskMap.get(id)?.totalTasks ?? 0,
      activeTasks: taskMap.get(id)?.activeTasks ?? 0,
      completedTasks: taskMap.get(id)?.completedTasks ?? 0,
      overdueTasks: taskMap.get(id)?.overdueTasks ?? 0,
      totalTaskAssignments: taskAssignmentMap.get(id) ?? 0,
      totalPayments: toMoneyMinor(paymentMap.get(id)?.totalPayments),
      paymentCount: paymentMap.get(id)?.paymentCount ?? 0,
      lastPaymentAt: paymentMap.get(id)?.lastPaymentAt ?? null
    };
  });
}

export async function getAdminOverview() {
  await requirePlatformAdmin();

  const now = new Date();
  const [
    totalCompanies,
    activeCompanies,
    paidCompanyIds,
    employeeIds,
    meetingUserIds,
    totalMeetings,
    completedMeetings,
    totalTasks,
    activeTasks,
    overdueTasks,
    activeMeetings,
    paymentAggregate,
    paymentCount,
    activeSubscriptions,
    planMix
  ] = await Promise.all([
    Company.countDocuments(),
    Company.countDocuments({ publicBookingEnabled: true }),
    Payment.distinct("companyId", { status: "CAPTURED" }),
    Membership.distinct("userId", { active: true, role: "EMPLOYEE" }),
    BookingRequest.distinct("customerId"),
    Meeting.countDocuments(),
    Meeting.countDocuments({ status: "COMPLETED" }),
    Task.countDocuments(),
    Task.countDocuments({ status: { $in: ["TODO", "IN_PROGRESS", "BLOCKED", "IN_REVIEW"] } }),
    Task.countDocuments({ dueAt: { $lt: now }, status: { $nin: ["COMPLETED", "CANCELLED"] } }),
    Meeting.countDocuments({ status: { $in: ["CREATING", "READY", "LIVE"] } }),
    Payment.aggregate<{ _id: null; total: number }>([
      { $match: { status: "CAPTURED" } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]),
    Payment.countDocuments({ status: "CAPTURED" }),
    Subscription.countDocuments({ status: "ACTIVE", currentPeriodEnd: { $gt: now } }),
    Subscription.aggregate<{ _id: string; count: number }>([
      { $group: { _id: "$planId", count: { $sum: 1 } } }
    ])
  ]);

  const vaultUsage = await getAdminVaultUsage();

  await ensurePlanCatalog();
  const catalogPlanIds = await Plan.find({}).select("identifier").limit(200).lean();

  return {
    totalCompanies,
    activeCompanies,
    paidCompanies: paidCompanyIds.length,
    activeSubscriptions,
    totalEmployees: employeeIds.length,
    totalMeetingUsers: meetingUserIds.length,
    totalMeetings,
    completedMeetings,
    totalTasks,
    activeTasks,
    overdueTasks,
    activeMeetings,
    totalPayments: paymentCount,
    totalRevenue: paymentAggregate[0]?.total ?? 0,
    planMix: Object.fromEntries(
      catalogPlanIds.map((item) => [
        String(item.identifier),
        planMix.find((row) => row._id === item.identifier)?.count ?? 0
      ])
    ) as Record<string, number>,
    vaultUsage: {
      totals: vaultUsage.totals,
      items: vaultUsage.items.slice(0, 8)
    }
  };
}

export async function getAdminCompanies(search = "") {
  await requirePlatformAdmin();

  const cleaned = search.trim().slice(0, 80);
  const safeSearch = escapeRegex(cleaned);
  const query = safeSearch
    ? {
        $or: [
          { name: { $regex: safeSearch, $options: "i" } },
          { slug: { $regex: safeSearch, $options: "i" } },
          { email: { $regex: safeSearch, $options: "i" } }
        ]
      }
    : {};

  const companies = await Company.find(query)
    .sort({ name: 1, _id: 1 })
    .lean();

  const [rows, vaultSnapshot] = await Promise.all([
    buildCompanyRows(companies as typeof companies),
    getAdminVaultUsage(companies.map((company) => String(company._id)))
  ]);
  const vaultByCompany = new Map(vaultSnapshot.items.map((item) => [item.companyId, item]));
  return rows.map((row) => ({
    ...row,
    vaultUsage: vaultByCompany.get(row.id) ?? null
  }));
}

export async function getAdminCompanyDetails(companyId: string) {
  await requirePlatformAdmin();
  if (!Types.ObjectId.isValid(companyId)) return null;

  const objectId = new Types.ObjectId(companyId);
  const company = await Company.findById(objectId).lean();
  if (!company) return null;

  await ensureInvoicesForCapturedPayments(String(objectId));

  const [baseRow, owner, members, memberUsers, subscription, payments, invoices, meetingStats, meetingRequestStats, recentMeetings, meetingCustomers] =
    await Promise.all([
      buildCompanyRows([company as never]).then((rows) => rows[0] ?? null),
      User.findById(company.ownerUserId).select("name email image").lean(),
      Membership.find({ companyId: objectId, active: true }).lean(),
      User.find({ _id: { $in: await Membership.find({ companyId: objectId, active: true }).distinct("userId") } }).select("name email").lean(),
      Subscription.findOne({ companyId: objectId }).lean(),
      Payment.find({ companyId: objectId }).sort({ createdAt: -1 }).limit(50).lean(),
      Invoice.find({ companyId: objectId }).sort({ issuedAt: -1 }).limit(50).lean(),
      Meeting.aggregate<{ _id: string; count: number }>([
        { $match: { companyId: objectId } },
        { $group: { _id: "$status", count: { $sum: 1 } } }
      ]),
      BookingRequest.aggregate<{ _id: string; count: number }>([
        { $match: { companyId: objectId } },
        { $group: { _id: "$status", count: { $sum: 1 } } }
      ]),
      Meeting.find({ companyId: objectId })
        .sort({ startAt: -1 })
        .limit(30)
        .select("employeeId customerId startAt endAt status")
        .lean(),
      BookingRequest.distinct("customerId", { companyId: objectId })
    ]);

  if (!baseRow) return null;

  const [vaultSnapshot, vaultFileRows, vaultFolderCount, activeVaultUploadRows] = await Promise.all([
    getAdminVaultUsage([String(objectId)]),
    VaultFile.find({ companyId: objectId })
      .sort({ createdAt: -1, _id: -1 })
      .select("_id originalName mimeType sizeBytes storageSizeBytes folderId createdByUserId createdAt")
      .limit(25)
      .lean(),
    VaultFolder.countDocuments({ companyId: objectId }),
    VaultUpload.aggregate<{
      _id: Types.ObjectId;
      originalName: string;
      sizeBytes: number;
      receivedChunks: number[];
      expectedChunks: number;
      status: "OPEN" | "COMPLETING";
      expiresAt: Date;
      createdAt: Date;
    }>([
      {
        $match: {
          companyId: objectId,
          status: { $in: ["OPEN", "COMPLETING"] },
          expiresAt: { $gt: new Date() }
        }
      },
      {
        $lookup: {
          from: VaultFile.collection.name,
          localField: "_id",
          foreignField: "uploadId",
          as: "committedFiles"
        }
      },
      { $match: { $expr: { $eq: [{ $size: "$committedFiles" }, 0] } } },
      { $sort: { createdAt: -1, _id: -1 } },
      { $limit: 25 },
      {
        $project: {
          originalName: 1,
          sizeBytes: 1,
          receivedChunks: 1,
          expectedChunks: 1,
          status: 1,
          expiresAt: 1,
          createdAt: 1
        }
      }
    ])
  ]);
  const vaultUsage = vaultSnapshot.items[0];
  if (!vaultUsage) throw new Error("ADMIN_VAULT_USAGE_UNAVAILABLE");

  const vaultFolderIds = [...new Set(vaultFileRows
    .map((file) => file.folderId ? String(file.folderId) : "")
    .filter(Boolean))].map((id) => new Types.ObjectId(id));
  const vaultCreatorIds = [...new Set(vaultFileRows.map((file) => String(file.createdByUserId)))];
  const [vaultFolders, vaultCreators] = await Promise.all([
    vaultFolderIds.length
      ? VaultFolder.find({ companyId: objectId, _id: { $in: vaultFolderIds } }).select("_id name").lean()
      : Promise.resolve([]),
    vaultCreatorIds.length
      ? User.find({ _id: { $in: vaultCreatorIds } }).select("name email").lean()
      : Promise.resolve([])
  ]);
  const vaultFolderNames = new Map(vaultFolders.map((folder) => [String(folder._id), folder.name]));
  const vaultCreatorMap = new Map(vaultCreators.map((creator) => [String(creator._id), creator]));
  const vaultFiles = vaultFileRows.map((file) => {
    const creator = vaultCreatorMap.get(String(file.createdByUserId));
    return {
      id: String(file._id),
      name: file.originalName,
      mimeType: file.mimeType,
      originalSizeBytes: file.sizeBytes,
      storedBytes: file.storageSizeBytes ?? file.sizeBytes,
      folderName: file.folderId ? vaultFolderNames.get(String(file.folderId)) ?? "Folder unavailable" : "Root",
      createdAt: file.createdAt,
      uploadedBy: creator ? { name: creator.name ?? "Unknown user", email: creator.email ?? "" } : null
    };
  });
  const activeVaultUploads = activeVaultUploadRows.map((upload) => ({
    id: String(upload._id),
    name: upload.originalName,
    reservedBytes: upload.sizeBytes,
    receivedChunks: Array.isArray(upload.receivedChunks) ? upload.receivedChunks.length : 0,
    expectedChunks: upload.expectedChunks,
    status: upload.status,
    expiresAt: upload.expiresAt,
    createdAt: upload.createdAt
  }));

  const memberUserMap = new Map(memberUsers.map((item) => [String(item._id), item]));
  const connectedAccounts = await GoogleAccount.find({
    userId: { $in: members.map((member) => member.userId) },
    status: "CONNECTED"
  }).select("userId").lean();
  const connectedIds = new Set(connectedAccounts.map((item) => String(item.userId)));

  const meetingUserMap = new Map(
    (await User.find({
      _id: { $in: recentMeetings.flatMap((item) => [item.employeeId, item.customerId]) }
    }).select("name email").lean()).map((item) => [String(item._id), item])
  );

  const adminPlans = await listPlansForAdmin();
  const plans = Object.fromEntries(
    adminPlans.map((plan) => [plan.id, plan])
  ) as Record<string, AdminPlan>;
  const currentPlan = subscription?.planId ? plans[subscription.planId] : undefined;
  const alternativePlanId = currentPlan
    ? adminPlans.find((plan) => plan.id !== currentPlan.id && !plan.archivedAt)?.id ?? null
    : adminPlans.find((plan) => !plan.archivedAt)?.id ?? null;

  return {
    ...baseRow,
    planSuspended: Boolean(company.planSuspended),
    planSuspendedAt: company.planSuspendedAt ?? null,
    vaultUsage,
    vaultFolderCount,
    vaultFiles,
    activeVaultUploads,
    description: company.description ?? "",
    websiteUrl: company.websiteUrl ?? "",
    taxId: company.taxId ?? "",
    address: {
      line1: company.address?.line1 ?? "",
      line2: company.address?.line2 ?? "",
      city: company.address?.city ?? "",
      state: company.address?.state ?? "",
      postalCode: company.address?.postalCode ?? "",
      country: company.address?.country ?? ""
    },
    owner: owner ? { id: String(owner._id), name: owner.name, email: owner.email, image: owner.image ?? "" } : null,
    activeMembers: members.map((member) => {
      const user = memberUserMap.get(String(member.userId));
      return {
        id: String(member.userId),
        name: user?.name ?? "Unknown user",
        email: user?.email ?? "Unknown email",
        role: member.role,
        googleConnected: connectedIds.has(String(member.userId)),
        image: user?.image ?? ""
      };
    }),
    meetingRequestCounts: Object.fromEntries(meetingRequestStats.map((item) => [item._id, item.count])),
    meetingStatusCounts: Object.fromEntries(meetingStats.map((item) => [item._id, item.count])),
    customers: meetingCustomers.length,
    recentPayments: payments.map((payment) => ({
      id: String(payment._id),
      planId: payment.planId,
      status: payment.status,
      amount: payment.amount,
      currency: payment.currency,
      providerOrderId: payment.providerOrderId,
      providerPaymentId: payment.providerPaymentId ?? null,
      paidAt: payment.paidAt ?? null
    })),
    invoices: invoices.map((invoice) => ({
      id: String(invoice._id),
      invoiceNumber: invoice.invoiceNumber,
      planId: invoice.planId,
      amount: invoice.amount,
      currency: invoice.currency,
      issuedAt: invoice.issuedAt,
      isCurrentPlan: subscription?.status === "ACTIVE" &&
        subscription.currentPeriodEnd.getTime() > Date.now() &&
        subscription.planId === invoice.planId,
      gstAmount: invoice.taxSnapshot?.gstAmount ?? 0,
      gstRatePercent: invoice.taxSnapshot?.enabled ? invoice.taxSnapshot.ratePercent : 0,
      source: invoice.source ?? "PAID"
    })),
    recentMeetings: recentMeetings.map((meeting) => ({
      id: String(meeting._id),
      startAt: meeting.startAt,
      endAt: meeting.endAt,
      status: meeting.status,
      employee: meetingUserMap.get(String(meeting.employeeId))
        ? {
            name: meetingUserMap.get(String(meeting.employeeId))!.name,
            email: meetingUserMap.get(String(meeting.employeeId))!.email
          }
        : null,
      customer: meetingUserMap.get(String(meeting.customerId))
        ? {
            name: meetingUserMap.get(String(meeting.customerId))!.name,
            email: meetingUserMap.get(String(meeting.customerId))!.email
          }
        : null
    })),
    plans,
    alternativePlanId
  } satisfies AdminCompanyDetails;
}

export async function getAdminUsers() {
  await requirePlatformAdmin();

  const requestStats = await BookingRequest.aggregate<{
    _id: Types.ObjectId;
    totalRequests: number;
    companyIds: Types.ObjectId[];
    lastBookingAt: Date | null;
  }>([
    { $group: {
      _id: "$customerId",
      totalRequests: { $sum: 1 },
      companyIds: { $addToSet: "$companyId" },
      lastBookingAt: { $max: "$createdAt" }
    } },
    { $sort: { lastBookingAt: -1 } },
    { $limit: 200 }
  ]);

  const customerIds = requestStats.map((item) => item._id);
  if (!customerIds.length) return [] as AdminUserListItem[];

  const [users, meetingStats, companies] = await Promise.all([
    User.find({ _id: { $in: customerIds }, role: "CUSTOMER" }).select("name email image createdAt lastLoginAt").lean(),
    Meeting.aggregate<{
      _id: Types.ObjectId;
      totalMeetings: number;
      completedMeetings: number;
      cancelledMeetings: number;
    }>([
      { $match: { customerId: { $in: customerIds } } },
      { $group: {
        _id: "$customerId",
        totalMeetings: { $sum: 1 },
        completedMeetings: { $sum: { $cond: [{ $eq: ["$status", "COMPLETED"] }, 1, 0] } },
        cancelledMeetings: { $sum: { $cond: [{ $eq: ["$status", "CANCELLED"] }, 1, 0] } }
      } }
    ]),
    Company.find({ _id: { $in: requestStats.flatMap((item) => item.companyIds) } }).select("name").lean()
  ]);

  const requestMap = new Map(requestStats.map((item) => [String(item._id), item]));
  const meetingMap = new Map(meetingStats.map((item) => [String(item._id), item]));
  const companyMap = new Map(companies.map((item) => [String(item._id), item.name]));

  return users
    .map((user) => {
      const request = requestMap.get(String(user._id));
      const meeting = meetingMap.get(String(user._id));
      const companyIds = request?.companyIds ?? [];

      return {
        id: String(user._id),
        name: user.name,
        email: user.email,
        image: user.image ?? "",
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt ?? null,
        companyIds: companyIds.map(String),
        companies: companyIds.map((id) => companyMap.get(String(id))).filter((name): name is string => Boolean(name)),
        totalRequests: request?.totalRequests ?? 0,
        totalMeetings: meeting?.totalMeetings ?? 0,
        completedMeetings: meeting?.completedMeetings ?? 0,
        cancelledMeetings: meeting?.cancelledMeetings ?? 0,
        lastBookingAt: request?.lastBookingAt ?? null
      };
    })
    .sort((a, b) => (b.lastBookingAt?.getTime() ?? 0) - (a.lastBookingAt?.getTime() ?? 0));
}


export type AdminAccessUserListItem = {
  id: string;
  name: string;
  email: string;
  image: string;
  role: string;
  active: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
  companies: string[];
};

export async function getAdminAccessUsers(search = "") {
  await requirePlatformAdmin();

  const cleaned = search.trim().slice(0, 80);
  const safeSearch = escapeRegex(cleaned);
  const query = safeSearch
    ? {
        $or: [
          { name: { $regex: safeSearch, $options: "i" } },
          { email: { $regex: safeSearch, $options: "i" } },
          { role: { $regex: safeSearch, $options: "i" } }
        ]
      }
    : {};

  const users = await User.find(query)
    .sort({ createdAt: -1 })
    .limit(200)
    .select("name email image role active createdAt lastLoginAt")
    .lean();

  if (!users.length) return [] as AdminAccessUserListItem[];

  const userIds = users.map((user) => user._id);
  const memberships = await Membership.find({
    userId: { $in: userIds },
    active: true
  }).select("userId companyId").lean();

  const companyIds = [...new Set(memberships.map((membership) => String(membership.companyId)))];
  const companies = companyIds.length
    ? await Company.find({ _id: { $in: companyIds } }).select("name").lean()
    : [];

  const companyMap = new Map(companies.map((company) => [String(company._id), company.name]));
  const userCompanyMap = new Map<string, string[]>();

  for (const membership of memberships) {
    const userId = String(membership.userId);
    const companyName = companyMap.get(String(membership.companyId));
    if (!companyName) continue;
    const current = userCompanyMap.get(userId) ?? [];
    current.push(companyName);
    userCompanyMap.set(userId, current);
  }

  return users.map((user) => ({
    id: String(user._id),
    name: user.name,
    email: user.email,
    image: user.image ?? "",
    role: user.role,
    active: user.active !== false,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt ?? null,
    companies: userCompanyMap.get(String(user._id)) ?? []
  }));
}
