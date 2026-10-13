import mongoose from "mongoose";
import { loadLocalEnv, mongoDatabaseName } from "./lib/env.mjs";

const SEQUENCE_ID = "company-public-id";
const FIRST_PUBLIC_ID = 100001;

loadLocalEnv();
const uri = process.env.MONGODB_URI?.trim();
if (!uri) throw new Error("MONGODB_URI is not configured");

const databaseName = mongoDatabaseName();
await mongoose.connect(uri, { dbName: databaseName });
try {
  const db = mongoose.connection.db;
  if (!db) throw new Error("MONGODB_CONNECTION_UNAVAILABLE");

  const companies = db.collection("companies");
  const sequences = db.collection("companysequences");
  const existingSequence = await sequences.findOne({ _id: SEQUENCE_ID });
  let highest = Math.max(100000, Number(existingSequence?.value ?? 0));
  let previouslyAssigned = 0;
  let previousId = 0;

  // Verify current values first; never silently renumber an ID already issued.
  for await (const company of companies.find({ publicId: { $exists: true } })
    .project({ publicId: 1 })
    .sort({ publicId: 1, _id: 1 })) {
    const value = company.publicId;
    if (!Number.isSafeInteger(value) || value < FIRST_PUBLIC_ID) {
      throw new Error("INVALID_EXISTING_COMPANY_PUBLIC_ID: " + String(company._id));
    }
    if (value === previousId) {
      throw new Error("DUPLICATE_COMPANY_PUBLIC_ID: " + String(value));
    }
    previousId = value;
    highest = Math.max(highest, value);
    previouslyAssigned += 1;
  }

  let assigned = 0;
  const missing = companies.find({
    $or: [{ publicId: { $exists: false } }, { publicId: null }]
  }).sort({ createdAt: 1, _id: 1 }).project({ _id: 1 });

  // Stable order for the historical backfill; updates are idempotent and never overwrite an issued ID.
  for await (const company of missing) {
    const nextId = highest + 1;
    if (!Number.isSafeInteger(nextId)) throw new Error("COMPANY_PUBLIC_ID_RANGE_EXHAUSTED");
    const result = await companies.updateOne(
      {
        _id: company._id,
        $or: [{ publicId: { $exists: false } }, { publicId: null }]
      },
      { $set: { publicId: nextId } }
    );
    if (result.modifiedCount !== 1) {
      throw new Error("COMPANY_PUBLIC_ID_BACKFILL_RACE: " + String(company._id));
    }
    highest = nextId;
    assigned += 1;
  }

  const malformedCount = await companies.countDocuments({
    publicId: { $exists: true, $not: { $type: "number" } }
  });
  const missingCount = await companies.countDocuments({
    $or: [{ publicId: { $exists: false } }, { publicId: null }]
  });
  if (malformedCount || missingCount) {
    throw new Error("COMPANY_PUBLIC_ID_BACKFILL_INCOMPLETE");
  }

  await companies.createIndex(
    { publicId: 1 },
    { unique: true, sparse: true, name: "uniq_company_public_id" }
  );

  const latestSequence = await sequences.findOne({ _id: SEQUENCE_ID });
  const sequenceValue = Math.max(highest, Number(latestSequence?.value ?? 0), 100000);
  if (latestSequence) {
    await sequences.updateOne({ _id: SEQUENCE_ID }, { $max: { value: sequenceValue } });
  } else {
    try {
      await sequences.insertOne({ _id: SEQUENCE_ID, value: sequenceValue });
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === 11000)) throw error;
      await sequences.updateOne({ _id: SEQUENCE_ID }, { $max: { value: sequenceValue } });
    }
  }

  const finalMissing = await companies.countDocuments({
    $or: [{ publicId: { $exists: false } }, { publicId: null }]
  });
  if (finalMissing !== 0) throw new Error("COMPANY_PUBLIC_ID_MIGRATION_VERIFICATION_FAILED");

  console.log(JSON.stringify({
    databaseName,
    companiesReviewed: previouslyAssigned + assigned,
    publicIdsPreserved: previouslyAssigned,
    publicIdsAssigned: assigned,
    highestPublicId: highest,
    sequenceValue,
    uniqueIndex: "uniq_company_public_id",
    remainingMissingPublicIds: finalMissing
  }, null, 2));
} finally {
  await mongoose.disconnect();
}
