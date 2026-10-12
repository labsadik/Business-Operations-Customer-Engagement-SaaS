import crypto from "node:crypto";
import mongoose from "mongoose";
import { PLANS, PLAN_IDS } from "../lib/plans.ts";
import { loadLocalEnv, mongoDatabaseName } from "./lib/env.mjs";

loadLocalEnv();

const EXPECTED_DATABASE = "canvas_test";
const uri = process.env.MONGODB_URI?.trim();
const databaseName = mongoDatabaseName();

function positiveIntEnv(name, fallback, maximum) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(name + " must be a whole number.");
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(name + " must be between 1 and " + maximum + ".");
  }
  return value;
}

const companyCount = positiveIntEnv("SMOKE_COMPANY_COUNT", 10000, 10000);
const membersPerCompany = positiveIntEnv("SMOKE_MEMBERS_PER_COMPANY", 50, 50);
const companyBatchSize = 200;
const bulkBatchSize = 1000;
const ObjectId = mongoose.Types.ObjectId;
const now = new Date();
const subscriptionEnd = new Date(now);
subscriptionEnd.setDate(subscriptionEnd.getDate() + PLANS.elite.validityDays);

const sha256 = (value) => crypto.createHash("sha256").update("canvas-scale-smoke-v1:" + value).digest("hex");
const objectId = (key) => new ObjectId(sha256(key).slice(0, 24));
const padded = (value, width = 5) => String(value).padStart(width, "0");

if (!uri) throw new Error("MONGODB_URI is not configured. Add it to .env.local or .env.");
if (databaseName.toLowerCase() !== EXPECTED_DATABASE) {
  throw new Error(
    "Refusing to seed database '" + databaseName + "'. Set MONGODB_DB_NAME=canvas_test first. " +
    "The 10,000-company smoke seeder may write only to the isolated test database."
  );
}

async function bulkUpsert(collection, rows, filterFor = (row) => ({ _id: row._id })) {
  let upserted = 0;
  let modified = 0;
  for (let start = 0; start < rows.length; start += bulkBatchSize) {
    const batch = rows.slice(start, start + bulkBatchSize);
    const result = await collection.bulkWrite(batch.map((row) => {
      const { _id, createdAt, ...fields } = row;
      return {
        updateOne: {
          filter: filterFor(row),
          update: {
            $set: { ...fields, updatedAt: now },
            $setOnInsert: { _id, createdAt: createdAt ?? now }
          },
          upsert: true
        }
      };
    }), { ordered: true });
    upserted += result.upsertedCount ?? 0;
    modified += result.modifiedCount ?? 0;
  }
  return { upserted, modified, processed: rows.length };
}

async function insertMissingPlanRows(collection, rows) {
  let upserted = 0;
  for (let start = 0; start < rows.length; start += bulkBatchSize) {
    const batch = rows.slice(start, start + bulkBatchSize);
    const result = await collection.bulkWrite(batch.map((row) => {
      const { _id, createdAt, updatedAt, ...fields } = row;
      return {
        updateOne: {
          filter: { identifier: row.identifier },
          update: {
            $setOnInsert: {
              ...fields,
              _id,
              createdAt: createdAt ?? now,
              updatedAt: updatedAt ?? now
            }
          },
          upsert: true
        }
      };
    }), { ordered: true });
    upserted += result.upsertedCount ?? 0;
  }
  return { insertedIfMissing: upserted, totalCatalogPlans: rows.length };
}

function planRow(identifier, sortOrder) {
  const plan = PLANS[identifier];
  return {
    _id: objectId("plan:" + identifier),
    identifier,
    name: plan.name,
    description: "Canvas by AlgoQuit " + plan.name + " plan.",
    status: "PUBLIC",
    popular: false,
    recommended: false,
    priceInr: plan.priceInr,
    discountType: "NONE",
    discountValue: 0,
    maxWorkspaces: plan.maxWorkspaces,
    maxCompanies: plan.maxCompanies,
    maxEmployees: plan.maxEmployees,
    monthlyMeetingLimit: plan.monthlyMeetingLimit,
    maxMeetingDurationMinutes: plan.maxMeetingDurationMinutes,
    maxConcurrentMeetings: plan.maxConcurrentMeetings,
    taskManagementEnabled: plan.taskManagementEnabled,
    taskManagementDailyLimit: plan.taskManagementDailyLimit,
    vaultEnabled: plan.vaultEnabled,
    vaultQuotaBytes: plan.vaultQuotaBytes,
    vaultMaxFileBytes: plan.vaultMaxFileBytes,
    vaultMaxItems: plan.vaultMaxItems,
    liveChatEnabled: plan.liveChatEnabled,
    liveChatMonthlyLimit: plan.liveChatMonthlyLimit,
    liveChatCustomerLimit: plan.liveChatCustomerLimit,
    liveChatAgentLimit: plan.liveChatAgentLimit,
    liveChatRetentionDays: plan.liveChatRetentionDays,
    liveChatMessageCooldownSeconds: plan.liveChatMessageCooldownSeconds,
    liveChatPdfExportEnabled: plan.liveChatPdfExportEnabled,
    liveChatDeleteEnabled: plan.liveChatDeleteEnabled,
    validityDays: plan.validityDays,
    freeFeatureDays: plan.freeFeatureDays,
    requiresPayment: plan.requiresPayment,
    revision: 1,
    sortOrder,
    archivedAt: null,
    createdAt: now,
    updatedAt: now
  };
}

function entitlementSnapshot() {
  // Elite allows a 50-member tenant without making the smoke fixtures exceed the plan limit.
  return { ...PLANS.elite };
}

await mongoose.connect(uri, {
  dbName: databaseName,
  serverSelectionTimeoutMS: 10000,
  maxPoolSize: 10
});

try {
  const db = mongoose.connection.db;
  if (!db) throw new Error("MONGODB_CONNECTION_UNAVAILABLE");
  if (db.databaseName.toLowerCase() !== EXPECTED_DATABASE) {
    throw new Error("Connected to unexpected database '" + db.databaseName + "'.");
  }

  const collection = (name) => db.collection(name);
  const counts = {};
  const smokePlatformAdminId = objectId("user:smoke-platform-admin");
  counts.platformAdmin = await bulkUpsert(collection("users"), [{
    _id: smokePlatformAdminId,
    email: "smoke-platform-admin@canvas.test",
    name: "Canvas Smoke Platform Admin",
    role: "PLATFORM_ADMIN",
    active: true,
    jobTitle: "Platform Administrator",
    department: "AlgoQuit",
    createdAt: now,
    updatedAt: now
  }]);

  // Preserve custom plan edits or demo entitlements already present in canvas_test.
  counts.plans = await insertMissingPlanRows(
    collection("plans"),
    PLAN_IDS.map((id, index) => planRow(id, index))
  );

  let companiesProcessed = 0;
  let usersProcessed = 0;
  let membershipsProcessed = 0;
  let workspacesProcessed = 0;
  let subscriptionsProcessed = 0;
  let meetingTypesProcessed = 0;
  let availabilityRulesProcessed = 0;

  const snapshot = entitlementSnapshot();

  for (let offset = 1; offset <= companyCount; offset += companyBatchSize) {
    const end = Math.min(companyCount, offset + companyBatchSize - 1);
    const companyRows = [];
    const workspaceRows = [];
    const subscriptionRows = [];
    const meetingTypeRows = [];
    const availabilityRows = [];
    const companyIdByIndex = new Map();
    const workspaceIdByIndex = new Map();
    const ownerIdByIndex = new Map();

    for (let index = offset; index <= end; index += 1) {
      const number = padded(index);
      const slug = "canvas-smoke-" + number;
      const companyId = objectId("company:" + slug);
      const workspaceId = objectId("workspace:" + slug);
      const ownerId = objectId("member:" + slug + ":0001");
      const storageRoot = "canvas-smoke/" + slug + "/" + companyId.toHexString();

      companyIdByIndex.set(index, companyId);
      workspaceIdByIndex.set(index, workspaceId);
      ownerIdByIndex.set(index, ownerId);

      companyRows.push({
        _id: companyId,
        name: "Canvas Smoke Company " + number,
        slug,
        email: "office+" + number + "@canvas.test",
        phone: "+910000" + number.padStart(6, "0"),
        websiteUrl: "https://" + slug + ".canvas.test",
        description: "Synthetic scale-test tenant for Canvas by AlgoQuit.",
        address: { city: "Kolkata", state: "West Bengal", country: "India" },
        publicBookingEnabled: false,
        planSuspended: false,
        planExpired: false,
        planExpiryTestActive: false,
        vaultStorageRoot: storageRoot,
        ownerUserId: ownerId,
        createdAt: now,
        updatedAt: now
      });

      workspaceRows.push({
        _id: workspaceId,
        companyId,
        name: "Canvas Smoke Company " + number + " Workspace",
        timezone: "Asia/Kolkata",
        active: true,
        createdAt: now,
        updatedAt: now
      });

      subscriptionRows.push({
        _id: objectId("subscription:" + slug),
        companyId,
        planId: "elite",
        entitlementSnapshot: snapshot,
        status: "ACTIVE",
        source: "ADMIN_GRANTED",
        grantedByUserId: smokePlatformAdminId,
        grantedAt: now,
        currentPeriodStart: now,
        currentPeriodEnd: subscriptionEnd,
        monthlyMeetingsUsed: 0,
        freeUsageDates: [],
        createdAt: now,
        updatedAt: now
      });

      meetingTypeRows.push({
        _id: objectId("meeting-type:" + slug + ":general"),
        companyId,
        workspaceId,
        name: "General meeting",
        slug: "general",
        description: "Default meeting type in a synthetic Canvas smoke-test tenant.",
        durationOptionsMinutes: [5],
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
        active: true,
        createdAt: now,
        updatedAt: now
      });

      // Seed a basic weekday schedule for the company admin. The full 10-company
      // demo seeder populates broader booking, task, chat, billing, and vault examples.
      for (const dayOfWeek of [1, 2, 3, 4, 5]) {
        availabilityRows.push({
          _id: objectId("availability:" + slug + ":owner:" + dayOfWeek),
          companyId,
          employeeId: ownerId,
          dayOfWeek,
          startMinute: 540,
          endMinute: 1020,
          timezone: "Asia/Kolkata",
          active: true,
          createdAt: now,
          updatedAt: now
        });
      }
    }

    const [companies, workspaces, subscriptions, meetingTypes, availability] = await Promise.all([
      bulkUpsert(collection("companies"), companyRows),
      bulkUpsert(collection("workspaces"), workspaceRows, (row) => ({ companyId: row.companyId })),
      bulkUpsert(collection("subscriptions"), subscriptionRows, (row) => ({ companyId: row.companyId })),
      bulkUpsert(collection("meetingtypes"), meetingTypeRows, (row) => ({ companyId: row.companyId, slug: row.slug })),
      bulkUpsert(collection("availabilityrules"), availabilityRows)
    ]);

    companiesProcessed += companies.processed;
    workspacesProcessed += workspaces.processed;
    subscriptionsProcessed += subscriptions.processed;
    meetingTypesProcessed += meetingTypes.processed;
    availabilityRulesProcessed += availability.processed;

    const userRows = [];
    const membershipRows = [];

    for (let index = offset; index <= end; index += 1) {
      const number = padded(index);
      const slug = "canvas-smoke-" + number;
      const companyId = companyIdByIndex.get(index);
      const workspaceId = workspaceIdByIndex.get(index);
      const ownerId = ownerIdByIndex.get(index);

      for (let memberNumber = 1; memberNumber <= membersPerCompany; memberNumber += 1) {
        const memberCode = String(memberNumber).padStart(4, "0");
        const isOwner = memberNumber === 1;
        const userId = isOwner ? ownerId : objectId("member:" + slug + ":" + memberCode);
        const email = "smoke-" + slug + "-m" + memberCode + "@canvas.test";

        userRows.push({
          _id: userId,
          email,
          name: isOwner ? "Canvas Smoke Owner " + number : "Canvas Smoke Member " + number + "-" + memberCode,
          role: isOwner ? "COMPANY_ADMIN" : "EMPLOYEE",
          active: true,
          jobTitle: isOwner ? "Company Administrator" : "Team Member",
          department: isOwner ? "Leadership" : "Operations",
          createdAt: now,
          updatedAt: now
        });

        membershipRows.push({
          _id: objectId("membership:" + slug + ":" + memberCode),
          companyId,
          workspaceId,
          userId,
          role: isOwner ? "COMPANY_ADMIN" : "EMPLOYEE",
          active: true,
          employmentStatus: "ACTIVE",
          createdAt: now,
          updatedAt: now
        });
      }
    }

    const [users, memberships] = await Promise.all([
      bulkUpsert(collection("users"), userRows),
      bulkUpsert(collection("memberships"), membershipRows, (row) => ({ companyId: row.companyId, userId: row.userId }))
    ]);
    usersProcessed += users.processed;
    membershipsProcessed += memberships.processed;

    console.log(JSON.stringify({
      companyRange: [offset, end],
      companiesProcessed,
      membersProcessed: usersProcessed,
      membershipsProcessed
    }));
  }

  const expectedUsers = companyCount * membersPerCompany;
  const companyPrefix = { slug: { $regex: /^canvas-smoke-/ } };
  const actual = {
    companies: await collection("companies").countDocuments(companyPrefix),
    workspaces: await collection("workspaces").countDocuments({ name: /^Canvas Smoke Company .* Workspace$/ }),
    members: await collection("users").countDocuments({ email: /^smoke-canvas-smoke-/ }),
    memberships: await collection("memberships").countDocuments({
      companyId: { $in: Array.from({ length: companyCount }, (_, i) => objectId("company:canvas-smoke-" + padded(i + 1))) }
    }),
    subscriptions: await collection("subscriptions").countDocuments({
      companyId: { $in: Array.from({ length: companyCount }, (_, i) => objectId("company:canvas-smoke-" + padded(i + 1))) }
    }),
    meetingTypes: await collection("meetingtypes").countDocuments({ slug: "general", companyId: { $in: Array.from({ length: companyCount }, (_, i) => objectId("company:canvas-smoke-" + padded(i + 1))) } }),
    availabilityRules: await collection("availabilityrules").countDocuments({
      companyId: { $in: Array.from({ length: companyCount }, (_, i) => objectId("company:canvas-smoke-" + padded(i + 1))) }
    })
  };

  const expected = {
    companies: companyCount,
    workspaces: companyCount,
    members: expectedUsers,
    memberships: expectedUsers,
    subscriptions: companyCount,
    meetingTypes: companyCount,
    availabilityRules: companyCount * 5
  };
  console.log(JSON.stringify({
    product: "Canvas",
    company: "AlgoQuit",
    databaseName: db.databaseName,
    smokeTestOnly: true,
    configured: { companies: companyCount, membersPerCompany, expectedUsers },
    bootstrapRecords: counts,
    processed: {
      companies: companiesProcessed,
      workspaces: workspacesProcessed,
      users: usersProcessed,
      memberships: membershipsProcessed,
      subscriptions: subscriptionsProcessed,
      meetingTypes: meetingTypesProcessed,
      availabilityRules: availabilityRulesProcessed
    },
    expected,
    actual,
    idempotent: true
  }, null, 2));

  for (const key of Object.keys(expected)) {
    if (actual[key] !== expected[key]) {
      throw new Error("SMOKE_SEED_COUNT_MISMATCH:" + key + ":expected=" + expected[key] + ":actual=" + actual[key]);
    }
  }
} finally {
  await mongoose.disconnect();
}
