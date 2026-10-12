import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const source = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[match[1]] = value;
  }
}

function sameObjectId(a, b) {
  return Boolean(a && b && typeof a.equals === "function" && a.equals(b));
}

loadEnvFile(path.resolve(".env.local"));
loadEnvFile(path.resolve(".env"));
const uri = process.env.MONGODB_URI?.trim();
if (!uri) throw new Error("MONGODB_URI is not configured");

const removeLegacyCollection = process.argv.includes("--drop-legacy");
await mongoose.connect(uri, { dbName: "Conventus" });
try {
  const db = mongoose.connection.db;
  if (!db) throw new Error("MONGODB_CONNECTION_UNAVAILABLE");

  const legacyExists = await db.listCollections({ name: "adminauditevents" }, { nameOnly: true }).hasNext();
  if (!legacyExists) {
    console.log(JSON.stringify({ legacyCollection: "adminauditevents", status: "already-removed" }, null, 2));
  } else {
    const legacy = db.collection("adminauditevents");
    const platformAudit = db.collection("platformauditevents");
    const legacyCount = await legacy.countDocuments();
    let verifiedCount = 0;
    let mismatchCount = 0;

    for await (const event of legacy.find({})) {
      if (!event.actorUserId || !event.targetUserId || !event.action || !event.fromRole || !event.toRole) {
        mismatchCount += 1;
        console.error("AUDIT_EVENT_SOURCE_INVALID", String(event._id));
        continue;
      }

      const migrated = {
        _id: event._id,
        actorUserId: event.actorUserId,
        entityType: "USER",
        entityId: event.targetUserId,
        action: event.action,
        details: {
          fromRole: event.fromRole,
          toRole: event.toRole,
          migratedFrom: "AdminAuditEvent"
        },
        createdAt: event.createdAt,
        updatedAt: event.updatedAt
      };

      await platformAudit.updateOne(
        { _id: event._id },
        { $setOnInsert: migrated },
        { upsert: true }
      );

      const stored = await platformAudit.findOne({ _id: event._id });
      const valid = stored &&
        stored.entityType === "USER" &&
        stored.action === event.action &&
        sameObjectId(stored.actorUserId, event.actorUserId) &&
        sameObjectId(stored.entityId, event.targetUserId) &&
        stored.details?.fromRole === event.fromRole &&
        stored.details?.toRole === event.toRole;
      if (!valid) {
        mismatchCount += 1;
        console.error("AUDIT_EVENT_MIGRATION_MISMATCH", String(event._id));
        continue;
      }
      verifiedCount += 1;
    }

    if (mismatchCount || verifiedCount !== legacyCount) {
      throw new Error("AUDIT_EVENT_MIGRATION_INCOMPLETE: legacy collection retained.");
    }

    if (removeLegacyCollection) {
      // The legacy collection is removed only after each source record is verified by _id and payload.
      await legacy.drop();
    }

    console.log(JSON.stringify({
      legacyCollection: "adminauditevents",
      canonicalCollection: "platformauditevents",
      legacyEventsVerified: verifiedCount,
      legacyCollectionRemoved: removeLegacyCollection,
      nextStep: removeLegacyCollection ? "complete" : "rerun with --drop-legacy after reviewing the verified count"
    }, null, 2));
  }
} finally {
  await mongoose.disconnect();
}
