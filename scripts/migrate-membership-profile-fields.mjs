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

function profileValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

loadEnvFile(path.resolve(".env.local"));
loadEnvFile(path.resolve(".env"));
const uri = process.env.MONGODB_URI?.trim();
if (!uri) throw new Error("MONGODB_URI is not configured");

await mongoose.connect(uri, { dbName: "Conventus" });
try {
  const db = mongoose.connection.db;
  if (!db) throw new Error("MONGODB_CONNECTION_UNAVAILABLE");

  const memberships = db.collection("memberships");
  const users = db.collection("users");
  let membershipsReviewed = 0;
  let jobTitlesCopied = 0;
  let departmentsCopied = 0;
  let orphanedMembershipProfiles = 0;

  // Newest membership profile values win only when a user's canonical field is empty.
  // Existing non-empty users.jobTitle/department values are never overwritten.
  const profileCursor = memberships.find({
    $or: [
      { jobTitle: { $exists: true } },
      { department: { $exists: true } },
      { googleConnectionStatus: { $exists: true } }
    ]
  }).sort({ updatedAt: -1, createdAt: -1, _id: 1 });

  for await (const membership of profileCursor) {
    membershipsReviewed += 1;
    const jobTitle = profileValue(membership.jobTitle);
    const department = profileValue(membership.department);
    if (!jobTitle && !department) continue;

    const userExists = membership.userId
      ? await users.findOne({ _id: membership.userId }, { projection: { _id: 1 } })
      : null;
    if (!userExists) {
      orphanedMembershipProfiles += 1;
      continue;
    }

    if (jobTitle) {
      const result = await users.updateOne(
        {
          _id: membership.userId,
          $or: [
            { jobTitle: { $exists: false } },
            { jobTitle: null },
            { jobTitle: "" }
          ]
        },
        { $set: { jobTitle } }
      );
      jobTitlesCopied += result.modifiedCount;
    }

    if (department) {
      const result = await users.updateOne(
        {
          _id: membership.userId,
          $or: [
            { department: { $exists: false } },
            { department: null },
            { department: "" }
          ]
        },
        { $set: { department } }
      );
      departmentsCopied += result.modifiedCount;
    }
  }

  if (orphanedMembershipProfiles > 0) {
    throw new Error(
      "ORPHANED_MEMBERSHIP_PROFILE_DATA: " +
      orphanedMembershipProfiles +
      " membership record(s) contain profile data without a matching user; repair those references before removing the old fields."
    );
  }

  const fieldsRemoved = await memberships.updateMany(
    {
      $or: [
        { jobTitle: { $exists: true } },
        { department: { $exists: true } }
      ]
    },
    { $unset: { jobTitle: "", department: "" } }
  );

  const remainingLegacyFields = await memberships.countDocuments({
    $or: [
      { jobTitle: { $exists: true } },
      { department: { $exists: true } },
      { googleConnectionStatus: { $exists: true } }
    ]
  });

  console.log(JSON.stringify({
    membershipsReviewed,
    jobTitlesCopied,
    departmentsCopied,
    membershipRecordsCleaned: fieldsRemoved.modifiedCount,
    remainingLegacyFieldRecords: remainingLegacyFields
  }, null, 2));

  if (remainingLegacyFields > 0) {
    throw new Error("MEMBERSHIP_PROFILE_FIELDS_REMAIN; rerun the migration after resolving database permissions or write failures.");
  }
} finally {
  await mongoose.disconnect();
}
