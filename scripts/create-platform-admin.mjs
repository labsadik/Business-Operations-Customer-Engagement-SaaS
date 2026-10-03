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
    if (!match) continue;

    const key = match[1];
    let value = match[2].trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

// The Next.js runtime loads .env.local automatically. This standalone CLI
// loads the same local files so npm run admin:create works from PowerShell.
loadEnvFile(path.resolve(".env.local"));
loadEnvFile(path.resolve(".env"));

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

await mongoose.connect(uri);

const db = mongoose.connection.db;
if (!db) {
  throw new Error("MONGODB_CONNECTION_UNAVAILABLE");
}

const users = db.collection("users");
const existing = await users.findOne({ email });

const now = new Date();
const previousRole =
  existing?.role && existing.role !== "PLATFORM_ADMIN"
    ? existing.role
    : undefined;

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

console.log(\`Platform admin ready: \${result.email} (\${result._id})\`);
await mongoose.disconnect();
