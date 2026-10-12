import mongoose from "mongoose";
import { loadLocalEnv, mongoDatabaseName } from "./lib/env.mjs";

loadLocalEnv();

const uri = process.env.MONGODB_URI?.trim();
if (!uri) throw new Error("MONGODB_URI is not configured");

const databaseName = mongoDatabaseName();
await mongoose.connect(uri, { dbName: databaseName });
try {
  const db = mongoose.connection.db;
  if (!db) throw new Error("MONGODB_CONNECTION_UNAVAILABLE");
  const [userRoles, previousRoles, memberRoles, sessionRoles] = await Promise.all([
    db.collection("users").updateMany({ role: "COMPANY_OWNER" }, { $set: { role: "COMPANY_ADMIN" } }),
    db.collection("users").updateMany({ platformAdminPreviousRole: "COMPANY_OWNER" }, { $set: { platformAdminPreviousRole: "COMPANY_ADMIN" } }),
    db.collection("memberships").updateMany({ role: "COMPANY_OWNER" }, { $set: { role: "COMPANY_ADMIN" } }),
    db.collection("sessions").updateMany({ role: "COMPANY_OWNER" }, { $set: { role: "COMPANY_ADMIN" } })
  ]);

  const unsupportedUsers = await db.collection("users").countDocuments({ role: { $nin: ["PLATFORM_ADMIN", "COMPANY_ADMIN", "EMPLOYEE", "CUSTOMER"] } });
  const unsupportedMemberships = await db.collection("memberships").countDocuments({ role: { $nin: ["COMPANY_ADMIN", "EMPLOYEE"] } });
  const unsupportedSessions = await db.collection("sessions").countDocuments({ role: { $nin: ["PLATFORM_ADMIN", "COMPANY_ADMIN", "EMPLOYEE", "CUSTOMER"] } });
  console.log(JSON.stringify({
    usersMigrated: userRoles.modifiedCount,
    previousRolesMigrated: previousRoles.modifiedCount,
    membershipsMigrated: memberRoles.modifiedCount,
    sessionsMigrated: sessionRoles.modifiedCount,
    unsupportedUserRoleRecords: unsupportedUsers,
    unsupportedMembershipRoleRecords: unsupportedMemberships,
    unsupportedSessionRoleRecords: unsupportedSessions
  }, null, 2));
  if (unsupportedUsers || unsupportedMemberships || unsupportedSessions) throw new Error("UNSUPPORTED_ROLE_RECORDS_REMAIN; resolve these records before deployment");
} finally {
  await mongoose.disconnect();
}
