import mongoose from "mongoose";
import { loadLocalEnv, mongoDatabaseName } from "./lib/env.mjs";

// Load local environment files for the standalone CLI.
loadLocalEnv();

const email = process.argv[2]?.trim().toLowerCase();
const name = process.argv.slice(3).join(" ").trim();

if (!email || !email.includes("@")) {
  console.error("Usage: npm run admin:create -- admin@example.com [Admin Name]");
  process.exit(1);
}

const uri = process.env.MONGODB_URI?.trim();
if (!uri) {
  console.error("MONGODB_URI is not configured.");
  console.error("Add MONGODB_URI to .env.local (or .env) and run this command again.");
  process.exit(1);
}

const databaseName = mongoDatabaseName();
await mongoose.connect(uri, { dbName: databaseName });

const db = mongoose.connection.db;
if (!db) {
  throw new Error("MONGODB_CONNECTION_UNAVAILABLE");
}

const users = db.collection("users");
const existing = await users.findOne({ email });

const now = new Date();
const previousRoleRaw = existing?.role && existing.role !== "PLATFORM_ADMIN" ? existing.role : undefined;
const previousRole = previousRoleRaw === "COMPANY_OWNER"
  ? "COMPANY_ADMIN"
  : ["CUSTOMER", "COMPANY_ADMIN", "EMPLOYEE"].includes(previousRoleRaw)
    ? previousRoleRaw
    : previousRoleRaw ? "CUSTOMER" : undefined;

const result = await users.findOneAndUpdate(
  { email },
  {
    $set: {
      email,
      name: name || existing?.name || email.split("@")[0],
      role: "PLATFORM_ADMIN",
      active: true,
      ...(existing?.googleEmail ? { googleEmail: existing.googleEmail } : {}),
      updatedAt: now
    },
    $setOnInsert: { createdAt: now }
  },
  { upsert: true, returnDocument: "after" }
);

if (!result) {
  throw new Error("PLATFORM_ADMIN_CREATE_FAILED");
}

if (previousRole) {
  await users.updateOne(
    { _id: result._id },
    { $set: { platformAdminPreviousRole: previousRole } }
  );
}

console.log("Platform admin ready: " + result.email + " (" + result._id + ")");
await mongoose.disconnect();
