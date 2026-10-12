import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { PLANS } from "../lib/plans.ts";
import { BOOKING_ACTIVITY_ACTOR_ROLES, BOOKING_ACTIVITY_EVENT_TYPES, BOOKING_OUTCOMES, BOOKING_STATUSES } from "../lib/booking-state.ts";
import { TASK_ACTIVITY_EVENT_TYPES, TASK_NOTIFICATION_TYPES, TASK_PRIORITIES, TASK_STATUSES } from "../features/task-management/shared/constants.ts";
import { loadLocalEnv, mongoDatabaseName } from "./lib/env.mjs";

loadLocalEnv();

const uri = process.env.MONGODB_URI?.trim();
const databaseName = mongoDatabaseName();
const EXPECTED_TEST_DATABASE = "canvas_test";

if (!uri) {
  throw new Error("MONGODB_URI is not configured. Add it to .env.local or .env.");
}
if (databaseName.toLowerCase() !== EXPECTED_TEST_DATABASE) {
  throw new Error(
    "Refusing to seed database '" + databaseName + "'. Set MONGODB_DB_NAME=canvas_test first. " +
    "This demo seeder is deliberately restricted to the isolated test database."
  );
}

const ObjectId = mongoose.Types.ObjectId;
const now = new Date();
const addDays = (date, days) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
const addMinutes = (date, minutes) => new Date(date.getTime() + minutes * 60 * 1000);
const isoDay = now.toISOString().slice(0, 10);
const periodKey = now.getUTCFullYear() + "-" + String(now.getUTCMonth() + 1).padStart(2, "0");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const objectId = (key) => new ObjectId(sha256("canvas-demo-v1:" + key).slice(0, 24));
const record = (key, fields, createdAt = now) => ({
  _id: objectId(key),
  ...fields,
  createdAt,
  updatedAt: now
});

const companySeeds = [
  { name: "Northstar Advisory", slug: "northstar-advisory", industry: "Professional Services", city: "Kolkata", state: "West Bengal" },
  { name: "Meridian Health", slug: "meridian-health", industry: "Healthcare", city: "Bengaluru", state: "Karnataka" },
  { name: "Atlas Legal Group", slug: "atlas-legal", industry: "Legal Services", city: "Mumbai", state: "Maharashtra" },
  { name: "BluePeak Analytics", slug: "bluepeak-analytics", industry: "Analytics", city: "Hyderabad", state: "Telangana" },
  { name: "Greenfield Realty", slug: "greenfield-realty", industry: "Real Estate", city: "Pune", state: "Maharashtra" },
  { name: "Summit Learning", slug: "summit-learning", industry: "Education", city: "Chennai", state: "Tamil Nadu" },
  { name: "Orbit Logistics", slug: "orbit-logistics", industry: "Logistics", city: "New Delhi", state: "Delhi" },
  { name: "Nova Digital Studio", slug: "nova-digital", industry: "Digital Services", city: "Jaipur", state: "Rajasthan" },
  { name: "Cedar Finance Partners", slug: "cedar-finance", industry: "Finance", city: "Ahmedabad", state: "Gujarat" },
  { name: "Harbor Hospitality", slug: "harbor-hospitality", industry: "Hospitality", city: "Kochi", state: "Kerala" }
];

const firstNames = [
  "Aarav", "Aditi", "Akash", "Ananya", "Arjun", "Diya", "Ishaan", "Kavya",
  "Meera", "Neel", "Riya", "Sana", "Vihaan", "Zara", "Kabir", "Ira",
  "Dev", "Mira", "Rehan", "Tara", "Advik", "Naina", "Rohan", "Siya",
  "Arnav", "Kiara", "Manav", "Myra", "Reyansh", "Sara", "Yash", "Anika",
  "Dhruv", "Ishita", "Kunal", "Lavanya", "Nikhil", "Pooja", "Rahul", "Trisha",
  "Varun", "Aanya", "Farhan", "Jhanvi", "Om", "Prisha", "Sameer", "Tanvi",
  "Veer", "Aisha"
];
const lastNames = [
  "Sharma", "Das", "Patel", "Rao", "Mehta", "Iyer", "Nair", "Khan",
  "Gupta", "Sen", "Kapoor", "Joshi", "Malhotra", "Mukherjee", "Reddy", "Banerjee",
  "Chatterjee", "Verma", "Kulkarni", "Saxena", "Pillai", "Dutta", "Bose", "Jain",
  "Menon", "Sinha", "Agarwal", "Desai", "Ghosh", "Bhat", "Naidu", "Roy"
];
const customerNames = [
  "Jordan Lee", "Priya Kapoor", "Morgan Reed", "Anika Bose", "Rohan Shah",
  "Taylor Morgan", "Aisha Khan", "Dev Patel", "Maya Iyer", "Samir Das"
];

const platformAdminId = objectId("user:platform-admin");
const platformAdminEmail = "demo.platform.admin@canvas.test";
const platformAdmin = record("user:platform-admin", {
  email: platformAdminEmail,
  name: "Canvas Demo Platform Admin",
  role: "PLATFORM_ADMIN",
  active: true,
  jobTitle: "Platform Administrator",
  department: "AlgoQuit"
});

const demoPlans = Object.fromEntries(
  Object.entries(PLANS).map(([identifier, plan]) => [
    identifier,
    identifier === "pro"
      ? {
          ...plan,
          taskManagementEnabled: true,
          taskManagementDailyLimit: 10,
          vaultEnabled: true,
          vaultQuotaBytes: 5368709120,
          vaultMaxFileBytes: 104857600,
          vaultMaxItems: 1000,
          liveChatEnabled: true,
          liveChatMonthlyLimit: 1000,
          liveChatCustomerLimit: 500,
          liveChatAgentLimit: 5,
          liveChatRetentionDays: 30,
          liveChatMessageCooldownSeconds: 15,
          liveChatPdfExportEnabled: true,
          liveChatDeleteEnabled: true
        }
      : plan
  ])
);

const planRows = Object.entries(demoPlans).map(([identifier, plan], index) => {
  const entitlements = { ...plan };
  delete entitlements.id;
  return record("plan:" + identifier, {
    identifier,
    ...entitlements,
    description: identifier === "pro"
      ? "Canvas demo plan with sample meeting, task, vault, and live-chat data."
      : "Canvas by AlgoQuit sample " + plan.name + " plan.",
    status: "PUBLIC",
    popular: identifier === "pro",
    recommended: identifier === "pro",
    discountType: "NONE",
    discountValue: 0,
    revision: 1,
    sortOrder: index,
    archivedAt: null
  });
});

const users = [platformAdmin];
const companies = [];
const workspaces = [];
const memberships = [];
const subscriptions = [];
const meetingTypes = [];
const availabilityRules = [];
const bookingRequests = [];
const meetings = [];
const bookingActivities = [];
const invitations = [];
const googleAccounts = [];
const announcements = [];
const feedback = [];
const supportTickets = [];
const payments = [];
const invoices = [];
const tasks = [];
const taskAssignments = [];
const taskActivities = [];
const taskNotifications = [];
const taskDailyUsages = [];
const liveChatSettings = [];
const liveChatConversations = [];
const liveChatMessages = [];
const liveChatMonthlyCustomers = [];
const liveChatMonthlyUsages = [];
const vaultFolders = [];
const vaultUsages = [];
const platformAnnouncements = [
  record("platform-announcement:all-companies", {
    title: "Welcome to Canvas by AlgoQuit",
    message: "This is sample platform news for the Canvas demo database. No production notices are sent.",
    audience: "ALL_COMPANIES",
    targetCompanyIds: [],
    status: "PUBLISHED",
    createdByUserId: platformAdminId,
    updatedByUserId: platformAdminId,
    publishedAt: now
  }),
  record("platform-announcement:landing", {
    title: "Canvas demo environment",
    message: "Explore sample companies and feature data in the isolated canvas_test database.",
    audience: "LANDING_PAGE",
    targetCompanyIds: [],
    status: "PUBLISHED",
    createdByUserId: platformAdminId,
    updatedByUserId: platformAdminId,
    publishedAt: now
  })
];
const platformAuditEvents = [
  record("platform-audit:demo-seed", {
    actorUserId: platformAdminId,
    entityType: "USER",
    entityId: platformAdminId,
    action: "CANVAS_DEMO_DATABASE_SEEDED",
    details: { product: "Canvas", company: "AlgoQuit", databaseName, demoCompanyCount: 10, membersPerCompany: 50 }
  })
];

const companyInfo = [];

for (let ci = 0; ci < companySeeds.length; ci += 1) {
  const index = ci + 1;
  const seed = companySeeds[ci];
  const suffix = String(index).padStart(2, "0");
  const companyId = objectId("company:" + suffix);
  const workspaceId = objectId("workspace:" + suffix);
  const ownerId = objectId("user:company:" + suffix + ":owner");
  const companyEmail = "office@" + seed.slug + ".canvas.test";
  const companyAdminName = firstNames[(index * 3) % firstNames.length] + " " + lastNames[(index * 5) % lastNames.length];
  const companyAdminEmail = "owner@" + seed.slug + ".canvas.test";
  const periodStart = addDays(now, -2);
  const periodEnd = addDays(now, demoPlans.pro.validityDays);
  const storageRoot = "canvas-demo/" + seed.slug + "/" + companyId.toHexString();

  const owner = record("user:company:" + suffix + ":owner", {
    email: companyAdminEmail,
    name: companyAdminName,
    role: "COMPANY_ADMIN",
    active: true,
    jobTitle: "Company Administrator",
    department: "Operations",
    lastLoginAt: now
  });
  users.push(owner);

  const company = record("company:" + suffix, {
    name: seed.name,
    slug: seed.slug,
    email: companyEmail,
    phone: "+91-90000-" + String(10000 + index).slice(-5),
    websiteUrl: "https://" + seed.slug + ".canvas.test",
    description: seed.industry + " sample company for Canvas by AlgoQuit.",
    address: {
      line1: (10 + index) + " Demo Business Park",
      line2: "Test District",
      city: seed.city,
      state: seed.state,
      postalCode: String(700000 + index),
      country: "India"
    },
    taxId: "CANVASDEMO" + suffix,
    publicBookingEnabled: false,
    planSuspended: false,
    planAccessExpiresAt: periodEnd,
    planExpired: false,
    planExpiryTestActive: false,
    vaultStorageRoot: storageRoot,
    ownerUserId: ownerId
  });
  companies.push(company);

  const workspace = record("workspace:" + suffix, {
    companyId,
    name: seed.name + " Workspace",
    timezone: "Asia/Kolkata",
    active: true
  });
  workspaces.push(workspace);

  memberships.push(record("membership:" + suffix + ":owner", {
    companyId,
    workspaceId,
    userId: ownerId,
    role: "COMPANY_ADMIN",
    active: true,
    employmentStatus: "ACTIVE"
  }));

  const employees = [];
  for (let ei = 1; ei <= 49; ei += 1) {
    const memberIndex = String(ei).padStart(2, "0");
    const employeeId = objectId("user:company:" + suffix + ":employee:" + memberIndex);
    const first = firstNames[(ei + ci * 7) % firstNames.length];
    const last = lastNames[(ei * 3 + ci) % lastNames.length];
    const name = first + " " + last;
    const email = "employee." + memberIndex + "@" + seed.slug + ".canvas.test";
    const employmentStatus = ei % 17 === 0 ? "ON_LEAVE" : ei % 19 === 0 ? "INACTIVE" : "ACTIVE";
    const user = record("user:company:" + suffix + ":employee:" + memberIndex, {
      email,
      name,
      role: "EMPLOYEE",
      active: true,
      jobTitle: ["Account Manager", "Project Specialist", "Consultant", "Operations Analyst", "Customer Success Manager"][ei % 5],
      department: ["Operations", "Client Services", "Delivery", "Finance", "Customer Success"][ei % 5],
      lastLoginAt: ei % 4 === 0 ? addDays(now, -1) : addDays(now, -3)
    });
    users.push(user);
    employees.push({ _id: employeeId, user, email, name, employmentStatus, index: ei });
    memberships.push(record("membership:" + suffix + ":employee:" + memberIndex, {
      companyId,
      workspaceId,
      userId: employeeId,
      role: "EMPLOYEE",
      active: true,
      employmentStatus
    }));
    if (employmentStatus === "ACTIVE") {
      for (let day = 1; day <= 5; day += 1) {
        availabilityRules.push(record("availability:" + suffix + ":" + memberIndex + ":" + day, {
          companyId,
          employeeId,
          dayOfWeek: day,
          startMinute: 9 * 60,
          endMinute: 17 * 60,
          timezone: "Asia/Kolkata",
          active: true
        }));
      }
    }
  }

  const activeEmployees = employees.filter((item) => item.employmentStatus === "ACTIVE");
  const customers = [];
  for (let customerIndex = 0; customerIndex < 2; customerIndex += 1) {
    const customerId = objectId("user:company:" + suffix + ":customer:" + (customerIndex + 1));
    const name = customerNames[(ci * 2 + customerIndex) % customerNames.length];
    const email = "client." + String(customerIndex + 1).padStart(2, "0") + "@" + seed.slug + ".canvas.test";
    const user = record("user:company:" + suffix + ":customer:" + (customerIndex + 1), {
      email,
      name,
      role: "CUSTOMER",
      active: true,
      lastLoginAt: addDays(now, -2)
    });
    users.push(user);
    customers.push({ _id: customerId, user, email, name });
  }

  subscriptions.push(record("subscription:" + suffix, {
    companyId,
    planId: "pro",
    entitlementSnapshot: { ...demoPlans.pro },
    status: "ACTIVE",
    source: "ADMIN_GRANTED",
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    monthlyMeetingsUsed: 7,
    freeUsageDates: [],
    grantedByUserId: platformAdminId,
    grantedAt: periodStart
  }));

  const typeGeneralId = objectId("meeting-type:" + suffix + ":general");
  const typeConsultId = objectId("meeting-type:" + suffix + ":consultation");
  meetingTypes.push(
    record("meeting-type:" + suffix + ":general", {
      companyId,
      workspaceId,
      name: "General meeting",
      slug: "general",
      description: "Introductory discussion with the team.",
      durationOptionsMinutes: [15, 30],
      bufferBeforeMinutes: 5,
      bufferAfterMinutes: 5,
      active: true
    }),
    record("meeting-type:" + suffix + ":consultation", {
      companyId,
      workspaceId,
      name: "Client consultation",
      slug: "consultation",
      description: "A focused client consultation session.",
      durationOptionsMinutes: [30, 45, 60],
      bufferBeforeMinutes: 10,
      bufferAfterMinutes: 10,
      active: true
    })
  );

  const requestStates = [
    { key: "completed", status: BOOKING_STATUSES[5], start: addDays(now, -5), typeId: typeGeneralId, customer: customers[0], employee: activeEmployees[0], event: BOOKING_ACTIVITY_EVENT_TYPES[8], outcome: BOOKING_OUTCOMES[7] },
    { key: "confirmed", status: BOOKING_STATUSES[3], start: addDays(now, 2), typeId: typeConsultId, customer: customers[1], employee: activeEmployees[1], event: BOOKING_ACTIVITY_EVENT_TYPES[5], outcome: BOOKING_OUTCOMES[4] },
    { key: "requested", status: BOOKING_STATUSES[0], start: addDays(now, 4), typeId: typeGeneralId, customer: customers[0], employee: activeEmployees[2], event: BOOKING_ACTIVITY_EVENT_TYPES[0], outcome: BOOKING_OUTCOMES[0] }
  ];

  for (let ri = 0; ri < requestStates.length; ri += 1) {
    const requestSeed = requestStates[ri];
    const requestId = objectId("booking:" + suffix + ":" + requestSeed.key);
    const requestedEndAt = addMinutes(requestSeed.start, requestSeed.key === "confirmed" ? 45 : 30);
    const acceptedAt = ["COMPLETED", "CONFIRMED"].includes(requestSeed.status) ? addMinutes(requestSeed.start, -60) : undefined;
    const confirmedAt = ["COMPLETED", "CONFIRMED"].includes(requestSeed.status) ? addMinutes(requestSeed.start, -45) : undefined;
    const booking = record("booking:" + suffix + ":" + requestSeed.key, {
      companyId,
      workspaceId,
      customerId: requestSeed.customer._id,
      meetingTypeId: requestSeed.typeId,
      requestedStartAt: requestSeed.start,
      requestedEndAt,
      requestedDurationMinutes: requestSeed.key === "confirmed" ? 45 : 30,
      status: requestSeed.status,
      expiresAt: addDays(now, 20),
      ...(requestSeed.status === BOOKING_STATUSES[0] ? {} : { assignedEmployeeId: requestSeed.employee._id }),
      acceptedAt,
      confirmedAt,
      idempotencyKey: "canvas-demo-" + suffix + "-" + requestSeed.key,
      declinedBy: [],
      meetingCreationAttempts: requestSeed.status === "REQUESTED" ? 0 : 1,
      usageReservedAt: acceptedAt,
      usageReservationPeriodStart: acceptedAt ? periodStart : undefined
    }, addDays(now, -ri - 1));
    bookingRequests.push(booking);

    bookingActivities.push(record("booking-activity:" + suffix + ":" + requestSeed.key, {
      companyId,
      bookingRequestId: requestId,
      eventType: requestSeed.event,
      fromStatus: requestSeed.key === "completed" ? "IN_PROGRESS" : "REQUESTED",
      toStatus: requestSeed.status,
      outcome: requestSeed.outcome,
      actorId: requestSeed.customer._id,
      actorRole: BOOKING_ACTIVITY_ACTOR_ROLES[0],
      ...(requestSeed.status === BOOKING_STATUSES[0] ? {} : { employeeId: requestSeed.employee._id }),
      occurredAt: addDays(now, -ri)
    }, addDays(now, -ri)));

    if (requestSeed.status === "COMPLETED" || requestSeed.status === "CONFIRMED") {
      meetings.push(record("meeting:" + suffix + ":" + requestSeed.key, {
        companyId,
        bookingRequestId: requestId,
        employeeId: requestSeed.employee._id,
        customerId: requestSeed.customer._id,
        startAt: requestSeed.start,
        endAt: requestedEndAt,
        status: requestSeed.status === "COMPLETED" ? "COMPLETED" : "READY",
        calendarSyncStatus: "PENDING",
        ...(requestSeed.status === "COMPLETED" ? { endedAt: requestedEndAt, endReason: "SCHEDULED" } : {})
      }, addDays(now, requestSeed.status === BOOKING_STATUSES[5] ? -5 : -1)));
    }
  }

  announcements.push(record("announcement:" + suffix, {
    companyId,
    title: "Welcome to " + seed.name,
    message: "This is a sample company notice in the Canvas demo database.",
    active: true,
    createdByUserId: ownerId
  }));
  invitations.push(record("invitation:" + suffix, {
    companyId,
    workspaceId,
    invitedEmail: "new.hire@" + seed.slug + ".canvas.test",
    tokenHash: sha256("canvas-demo-invitation:" + suffix),
    role: "EMPLOYEE",
    expiresAt: addDays(now, 14)
  }));
  googleAccounts.push(record("google-account:" + suffix, {
    userId: ownerId,
    googleSubject: "canvas-demo-disconnected-" + suffix,
    googleEmail: companyAdminEmail,
    encryptedRefreshToken: "demo-disconnected-no-token:" + suffix,
    scopes: [],
    status: "DISCONNECTED",
    lastErrorCode: "DEMO_ACCOUNT_NOT_CONNECTED"
  }));

  feedback.push(
    record("feedback:" + suffix + ":1", {
      source: "CUSTOMER_BOOKING",
      companyId,
      workspaceId,
      submitterUserId: customers[0]._id,
      submitterName: customers[0].name,
      submitterEmail: customers[0].email,
      bookingRequestId: objectId("booking:" + suffix + ":completed"),
      rating: 5,
      description: "Clear communication and a helpful meeting.",
      reviewStatus: "REVIEWED",
      reviewStatusChangedAt: now,
      reviewStatusChangedByUserId: ownerId
    }, addDays(now, -2)),
    record("feedback:" + suffix + ":2", {
      source: "COMPANY_PLATFORM",
      companyId,
      workspaceId,
      submitterUserId: ownerId,
      submitterName: companyAdminName,
      submitterEmail: companyAdminEmail,
      rating: 4,
      description: "The Canvas workspace keeps our coordination in one place.",
      reviewStatus: "NEW"
    }, addDays(now, -1))
  );

  supportTickets.push(record("support-ticket:" + suffix, {
    companyId,
    workspaceId,
    submitterUserId: ownerId,
    submitterName: companyAdminName,
    submitterEmail: companyAdminEmail,
    subject: "Sample support request",
    description: "Example support ticket for reviewing the Canvas support workflow.",
    dedupeKey: sha256("canvas-demo-support-ticket:" + suffix),
    status: index % 3 === 0 ? "COMPLETED" : "NOT_SEEN",
    ...(index % 3 === 0 ? { statusChangedAt: now, statusChangedByUserId: platformAdminId } : {})
  }, addDays(now, -index)));

  payments.push(record("payment:" + suffix + ":failed", {
    companyId,
    planId: "pro",
    merchantAccount: "CONVENTUS",
    providerOrderId: "canvas-demo-failed-order-" + suffix,
    amount: demoPlans.pro.priceInr,
    baseAmount: demoPlans.pro.priceInr,
    taxAmount: 0,
    taxRatePercent: 0,
    taxInclusive: false,
    currency: "INR",
    status: "FAILED",
    failureReason: "Demo-only failed checkout; no real payment was attempted.",
    planRevision: 1,
    discountType: "NONE",
    discountValue: 0,
    discountAmount: 0
  }, addDays(now, -4)));

  const planSnapshot = { ...demoPlans.pro };
  invoices.push(record("invoice:" + suffix, {
    companyId,
    source: "ADMIN_GRANTED",
    invoiceNumber: "CANVAS-DEMO-" + String(20260000 + index),
    planId: "pro",
    providerOrderId: "",
    providerPaymentId: "",
    amount: 0,
    currency: "INR",
    issuedAt: addDays(now, -1),
    billingPeriodStart: periodStart,
    billingPeriodEnd: periodEnd,
    serviceDescription: "Canvas by AlgoQuit demo plan access (no charge).",
    discountType: "NONE",
    discountValue: 0,
    discountAmount: 0,
    planSnapshot,
    merchantSnapshot: {
      name: "AlgoQuit",
      description: "Canvas by AlgoQuit — company workspace SaaS",
      logoUrl: "/favicon.svg",
      websiteUrl: process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000",
      email: "billing@algoquit.test",
      phone: "",
      taxId: "",
      gstin: "",
      sacCode: "",
      address: { line1: "", line2: "", city: "", state: "", postalCode: "", country: "India" }
    },
    companySnapshot: {
      name: seed.name,
      email: companyEmail,
      phone: String(company.phone),
      address: company.address,
      taxId: company.taxId
    },
    taxSnapshot: { enabled: false, ratePercent: 0, inclusive: false, taxableAmount: 0, gstAmount: 0 }
  }, addDays(now, -1)));

  liveChatSettings.push(record("livechat-settings:" + suffix, {
    companyId,
    workspaceId,
    publicWidgetEnabled: true,
    title: "Chat with " + seed.name,
    welcomeMessage: "Hello! Welcome to " + seed.name + ". How can our team help?",
    primaryColor: "#2563eb",
    theme: "LIGHT",
    position: "RIGHT",
    collectName: true,
    collectEmail: true,
    collectPhone: false,
    offlineMode: false,
    allowedDomains: ["localhost", "127.0.0.1", seed.slug + ".canvas.test"],
    launcherSize: 60,
    launcherIconSize: 28,
    launcherShape: "CIRCLE",
    panelRadius: 18,
    headerStyle: "GRADIENT",
    designTemplate: "MODERN"
  }));

  const visitorHash = sha256("canvas-demo-visitor:" + suffix);
  const conversationId = objectId("livechat-conversation:" + suffix);
  const conversationExpiresAt = addDays(now, 45);
  liveChatConversations.push(record("livechat-conversation:" + suffix, {
    companyId,
    workspaceId,
    visitorKeyHash: visitorHash,
    ipHash: sha256("canvas-demo-ip:" + suffix),
    originHost: seed.slug + ".canvas.test",
    customerName: customers[0].name,
    customerEmail: customers[0].email,
    customerPhone: "",
    geoCountry: "India",
    geoCity: seed.city,
    geoRegion: seed.state,
    ipDisplay: "",
    browser: "Demo Browser",
    os: "Demo OS",
    deviceType: "DESKTOP",
    referrer: "http://localhost:3000",
    assignedAgentId: ownerId,
    unreadAgentCount: 0,
    lastMessagePreview: "Thank you, the team will follow up shortly.",
    status: "OPEN",
    messageCount: 2,
    lastMessageAt: addMinutes(now, -2),
    nextCustomerMessageAt: null,
    expiresAt: conversationExpiresAt
  }, addMinutes(now, -5)));

  liveChatMessages.push(
    record("livechat-message:" + suffix + ":customer", {
      companyId,
      workspaceId,
      conversationId,
      senderType: "CUSTOMER",
      body: "Hello, I have a question about a consultation.",
      expiresAt: conversationExpiresAt
    }, addMinutes(now, -5)),
    record("livechat-message:" + suffix + ":agent", {
      companyId,
      workspaceId,
      conversationId,
      senderType: "AGENT",
      senderUserId: ownerId,
      body: "Thanks for reaching out. We will help you with that.",
      expiresAt: conversationExpiresAt
    }, addMinutes(now, -2))
  );
  liveChatMonthlyCustomers.push(record("livechat-monthly-customer:" + suffix, {
    companyId,
    periodKey,
    visitorKeyHash: visitorHash,
    expiresAt: conversationExpiresAt
  }));
  liveChatMonthlyUsages.push(record("livechat-monthly-usage:" + suffix, {
    companyId,
    periodKey,
    chatCount: 1,
    customerCount: 1,
    expiresAt: conversationExpiresAt
  }));

  const rootFolderId = objectId("vault-folder:" + suffix + ":root");
  vaultFolders.push(
    record("vault-folder:" + suffix + ":root", {
      companyId,
      workspaceId,
      parentFolderId: null,
      createdByUserId: ownerId,
      name: "Company Files",
      nameKey: "company files",
      storageKey: storageRoot + "/folders/root"
    }),
    record("vault-folder:" + suffix + ":contracts", {
      companyId,
      workspaceId,
      parentFolderId: rootFolderId,
      createdByUserId: ownerId,
      name: "Contracts",
      nameKey: "contracts",
      storageKey: storageRoot + "/folders/contracts"
    })
  );
  vaultUsages.push(record("vault-usage:" + suffix, {
    companyId,
    workspaceId,
    usedBytes: 0,
    usedItems: 0,
    counterVersion: 2,
    quotaBytes: demoPlans.pro.vaultQuotaBytes
  }));

  const taskStatuses = TASK_STATUSES.slice(0, 5);
  const taskNames = [
    "Prepare onboarding checklist",
    "Review client proposal",
    "Confirm project requirements",
    "Share delivery timeline",
    "Complete customer handoff"
  ];
  for (let ti = 0; ti < taskNames.length; ti += 1) {
    const taskKey = "task:" + suffix + ":" + (ti + 1);
    const taskId = objectId(taskKey);
    const status = taskStatuses[ti];
    const employeeOne = activeEmployees[(ti * 2) % activeEmployees.length];
    const employeeTwo = activeEmployees[(ti * 2 + 1) % activeEmployees.length];
    const assignedAt = addDays(now, -(ti + 1));
    const dueAt = addDays(now, ti + 2);
    const taskPriority = TASK_PRIORITIES[ti % TASK_PRIORITIES.length];
    const startedAt = ["IN_PROGRESS", "BLOCKED", "IN_REVIEW", "COMPLETED"].includes(status) ? addDays(now, -(ti + 1)) : null;
    const completedAt = status === "COMPLETED" ? addDays(now, -1) : null;

    tasks.push(record(taskKey, {
      companyId,
      workspaceId,
      createdByUserId: ownerId,
      title: taskNames[ti],
      description: "Sample " + status.toLowerCase().replaceAll("_", " ") + " task for " + seed.name + ".",
      priority: taskPriority,
      status,
      dueAt,
      startedAt,
      completedAt,
      cancelledAt: null
    }, assignedAt));

    const assignees = [employeeOne, employeeTwo];
    for (let ai = 0; ai < assignees.length; ai += 1) {
      const employee = assignees[ai];
      const assignmentStatus = status;
      const assignmentKey = "task-assignment:" + suffix + ":" + (ti + 1) + ":" + (ai + 1);
      taskAssignments.push(record(assignmentKey, {
        companyId,
        workspaceId,
        taskId,
        assigneeUserId: employee._id,
        assignedByUserId: ownerId,
        status: assignmentStatus,
        assignedAt,
        startedAt,
        completedAt,
        statusChangedAt: status === "TODO" ? assignedAt : addDays(now, -1)
      }, assignedAt));

      taskNotifications.push(record("task-notification:" + suffix + ":" + (ti + 1) + ":" + (ai + 1), {
        companyId,
        workspaceId,
        taskId,
        recipientUserId: employee._id,
        actorUserId: ownerId,
        type: TASK_NOTIFICATION_TYPES[1],
        title: "New task assigned",
        message: "You were assigned: " + taskNames[ti] + ".",
        eventKey: "canvas-demo:" + suffix + ":task:" + (ti + 1) + ":assignee:" + (ai + 1),
        readAt: ti === 4 ? now : null
      }, assignedAt));
    }

    taskActivities.push(
      record("task-activity:" + suffix + ":" + (ti + 1) + ":created", {
        companyId,
        workspaceId,
        taskId,
        actorUserId: ownerId,
        subjectUserId: null,
        eventType: TASK_ACTIVITY_EVENT_TYPES[0],
        fromStatus: null,
        toStatus: "TODO",
        details: { title: taskNames[ti], priority: taskPriority, assigneeCount: assignees.length },
        occurredAt: assignedAt
      }, assignedAt),
      record("task-activity:" + suffix + ":" + (ti + 1) + ":assigned", {
        companyId,
        workspaceId,
        taskId,
        actorUserId: ownerId,
        subjectUserId: employeeOne._id,
        eventType: TASK_ACTIVITY_EVENT_TYPES[2],
        fromStatus: null,
        toStatus: status,
        details: { assigneeUserIds: assignees.map((item) => item._id.toHexString()) },
        occurredAt: assignedAt
      }, assignedAt)
    );
  }

  taskDailyUsages.push(record("task-daily-usage:" + suffix, {
    companyId,
    workspaceId,
    dayKey: isoDay,
    count: 10,
    expiresAt: addDays(now, 40)
  }));

  companyInfo.push({
    index,
    companyId,
    workspaceId,
    ownerId,
    companyAdminEmail,
    name: seed.name,
    slug: seed.slug,
    employees: activeEmployees,
    customers
  });
}

const platformSettings = [
  record("platform-settings:default", {
    key: "default",
    legalName: "AlgoQuit",
    description: "AlgoQuit builds Canvas, the company workspace SaaS for scheduling, tasks, files, and client communication.",
    websiteUrl: process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000",
    billingEmail: "billing@algoquit.test",
    phone: "",
    logoUrl: "/favicon.svg",
    taxId: "",
    gstin: "",
    sacCode: "",
    address: { line1: "", line2: "", city: "", state: "", postalCode: "", country: "India" },
    gst: { enabled: false, ratePercent: 18, inclusive: false },
    navigation: {
      dashboard: "Overview",
      meetings: "Meetings",
      team: "Team",
      feedback: "Feedback",
      supportTickets: "Support tickets",
      announcements: "Announcements",
      billing: "Billing",
      workspaceSettings: "Workspace settings",
      companyProfile: "Company profile",
      adminCompanies: "Companies",
      adminPublicUsers: "Public users",
      adminPlans: "Plans",
      adminAnnouncements: "Announcements",
      adminFeedback: "Feedback",
      adminSupportTickets: "Support tickets",
      adminAccess: "Admin access",
      adminPlatformSettings: "Platform settings"
    },
    updatedByUserId: platformAdminId
  })
];

const platformToken = crypto.randomBytes(48).toString("base64url");
const companyAdminToken = crypto.randomBytes(48).toString("base64url");
const sessionExpiresAt = addDays(now, 30);
const sessions = [
  record("session:platform-admin", {
    tokenHash: sha256(platformToken),
    userId: platformAdminId,
    role: "PLATFORM_ADMIN",
    expiresAt: sessionExpiresAt,
    lastSeenAt: now
  }),
  record("session:company-01-admin", {
    tokenHash: sha256(companyAdminToken),
    userId: objectId("company:01:member:owner"),
    role: "COMPANY_ADMIN",
    companyId: objectId("company:01"),
    workspaceId: objectId("workspace:01"),
    expiresAt: sessionExpiresAt,
    lastSeenAt: now
  })
];

const modelCollections = [
  "users", "companies", "workspaces", "memberships", "sessions", "plans", "subscriptions",
  "payments", "invoices", "meetingtypes", "availabilityrules", "bookingrequests", "meetings",
  "bookingactivities", "announcements", "platformannouncements", "platformauditevents",
  "platformsettings", "feedbacks", "supporttickets", "invitations", "googleaccounts",
  "livechatsettings", "livechatconversations", "livechatmessages", "livechatmonthlycustomers",
  "livechatmonthlyusages", "tasks", "taskassignments", "taskactivities", "taskdailyusages",
  "tasknotifications", "vaultfolders", "vaultfiles", "vaultuploads", "vaultusages", "oauthstates"
];

async function ensureCollections(db) {
  for (const name of modelCollections) {
    const exists = await db.listCollections({ name }, { nameOnly: true }).hasNext();
    if (!exists) {
      try {
        await db.createCollection(name);
      } catch (error) {
        if (!(error && typeof error === "object" && "code" in error && (error).code === 48)) throw error;
      }
    }
  }
}

async function upsertRows(db, collectionName, rows, filterFor) {
  if (!rows.length) return 0;
  const collection = db.collection(collectionName);
  for (let start = 0; start < rows.length; start += 500) {
    const batch = rows.slice(start, start + 500);
    await collection.bulkWrite(batch.map((row) => {
      const { _id, ...fields } = row;
      return {
        updateOne: {
          filter: filterFor ? filterFor(row) : { _id },
          update: {
            $set: fields,
            $setOnInsert: { _id }
          },
          upsert: true
        }
      };
    }), { ordered: true });
  }
  return rows.length;
}

await mongoose.connect(uri, {
  dbName: databaseName,
  serverSelectionTimeoutMS: 10000,
  maxPoolSize: 5
});

try {
  const db = mongoose.connection.db;
  if (!db) throw new Error("MONGODB_CONNECTION_UNAVAILABLE");
  if (db.databaseName.toLowerCase() !== EXPECTED_TEST_DATABASE) {
    throw new Error("Connected to unexpected database: " + db.databaseName);
  }

  await ensureCollections(db);

  const counts = {};
  const seeds = [
    ["users", users, (row) => ({ _id: row._id })],
    ["companies", companies, (row) => ({ _id: row._id })],
    ["workspaces", workspaces, (row) => ({ _id: row._id })],
    ["memberships", memberships, (row) => ({ companyId: row.companyId, userId: row.userId })],
    ["plans", planRows, (row) => ({ identifier: row.identifier })],
    ["subscriptions", subscriptions, (row) => ({ companyId: row.companyId })],
    ["sessions", sessions, (row) => ({ _id: row._id })],
    ["meetingtypes", meetingTypes, (row) => ({ companyId: row.companyId, slug: row.slug })],
    ["availabilityrules", availabilityRules, (row) => ({ _id: row._id })],
    ["bookingrequests", bookingRequests, (row) => ({ idempotencyKey: row.idempotencyKey })],
    ["meetings", meetings, (row) => ({ bookingRequestId: row.bookingRequestId })],
    ["bookingactivities", bookingActivities, (row) => ({ _id: row._id })],
    ["invitations", invitations, (row) => ({ tokenHash: row.tokenHash })],
    ["googleaccounts", googleAccounts, (row) => ({ userId: row.userId })],
    ["announcements", announcements, (row) => ({ _id: row._id })],
    ["feedbacks", feedback, (row) => ({ _id: row._id })],
    ["supporttickets", supportTickets, (row) => ({ dedupeKey: row.dedupeKey })],
    ["payments", payments, (row) => ({ providerOrderId: row.providerOrderId })],
    ["invoices", invoices, (row) => ({ invoiceNumber: row.invoiceNumber })],
    ["platformannouncements", platformAnnouncements, (row) => ({ _id: row._id })],
    ["platformauditevents", platformAuditEvents, (row) => ({ _id: row._id })],
    ["platformsettings", platformSettings, (row) => ({ key: row.key })],
    ["livechatsettings", liveChatSettings, (row) => ({ companyId: row.companyId, workspaceId: row.workspaceId })],
    ["livechatconversations", liveChatConversations, (row) => ({ _id: row._id })],
    ["livechatmessages", liveChatMessages, (row) => ({ _id: row._id })],
    ["livechatmonthlycustomers", liveChatMonthlyCustomers, (row) => ({ companyId: row.companyId, periodKey: row.periodKey, visitorKeyHash: row.visitorKeyHash })],
    ["livechatmonthlyusages", liveChatMonthlyUsages, (row) => ({ companyId: row.companyId, periodKey: row.periodKey })],
    ["tasks", tasks, (row) => ({ _id: row._id })],
    ["taskassignments", taskAssignments, (row) => ({ taskId: row.taskId, assigneeUserId: row.assigneeUserId })],
    ["taskactivities", taskActivities, (row) => ({ _id: row._id })],
    ["tasknotifications", taskNotifications, (row) => ({ eventKey: row.eventKey })],
    ["taskdailyusages", taskDailyUsages, (row) => ({ companyId: row.companyId, workspaceId: row.workspaceId, dayKey: row.dayKey })],
    ["vaultfolders", vaultFolders, (row) => ({ storageKey: row.storageKey })],
    ["vaultusages", vaultUsages, (row) => ({ companyId: row.companyId, workspaceId: row.workspaceId })]
  ];

  for (const [collectionName, rows, filterFor] of seeds) {
    counts[collectionName] = await upsertRows(db, collectionName, rows, filterFor);
  }

  const emptyButIntentionallyUnseeded = {
    oauthstates: "OAuth state is an expiring, in-flight login record.",
    vaultfiles: "Files require matching objects in the configured Bunny Storage account.",
    vaultuploads: "Uploads require actual chunk/session state and backing storage."
  };

  console.log(JSON.stringify({
    product: "Canvas by AlgoQuit",
    databaseName: db.databaseName,
    demoDataOnly: true,
    companiesCreatedOrUpdated: companies.length,
    membersPerCompany: 50,
    companyMembershipsCreatedOrUpdated: memberships.length,
    totalUsersCreatedOrUpdated: users.length,
    workspacesCreatedOrUpdated: workspaces.length,
    recordsCreatedOrUpdated: counts,
    collectionsEnsuredEmptyWhereAppropriate: emptyButIntentionallyUnseeded,
    demoAccess: {
      platformAdminEmail,
      platformAdminCookieName: "conventus_session",
      platformAdminCookieToken: platformToken,
      companyAdminEmail: companyInfo[0].companyAdminEmail,
      companyAdminCookieName: "conventus_session",
      companyAdminCookieToken: companyAdminToken,
      localBrowserInstructions: "On http://localhost:3000, open DevTools Console and set document.cookie to 'conventus_session=<token>; path=/; SameSite=Lax', then reload. The platform token opens the admin experience; the company token opens Northstar Advisory."
    }
  }, null, 2));
} finally {
  await mongoose.disconnect();
}
