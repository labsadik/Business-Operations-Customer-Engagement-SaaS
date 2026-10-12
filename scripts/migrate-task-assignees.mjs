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

function sortedIds(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter(Boolean).map(String))].sort();
}

loadEnvFile(path.resolve(".env.local"));
loadEnvFile(path.resolve(".env"));
const uri = process.env.MONGODB_URI?.trim();
if (!uri) throw new Error("MONGODB_URI is not configured");

const databaseName = process.env.MONGODB_DB_NAME?.trim() || "Conventus";
await mongoose.connect(uri, { dbName: databaseName });
try {
  const db = mongoose.connection.db;
  if (!db) throw new Error("MONGODB_CONNECTION_UNAVAILABLE");

  const tasks = db.collection("tasks");
  const taskAssignments = db.collection("taskassignments");
  const safeToClean = [];
  const mismatches = [];
  let reviewed = 0;

  const cursor = tasks.find(
    { assigneeUserIds: { $exists: true } },
    { projection: { _id: 1, companyId: 1, workspaceId: 1, assigneeUserIds: 1 } }
  );

  for await (const task of cursor) {
    reviewed += 1;
    const legacyIds = sortedIds(task.assigneeUserIds);
    const rows = await taskAssignments.find(
      { taskId: task._id, companyId: task.companyId, workspaceId: task.workspaceId },
      { projection: { assigneeUserId: 1 } }
    ).toArray();
    const normalizedIds = sortedIds(rows.map((row) => row.assigneeUserId));
    const missingAssignments = legacyIds.filter((id) => !normalizedIds.includes(id));
    const missingLegacyIds = normalizedIds.filter((id) => !legacyIds.includes(id));

    if (missingAssignments.length || missingLegacyIds.length) {
      mismatches.push({
        taskId: String(task._id),
        assigneeIdsMissingAssignmentRows: missingAssignments,
        assignmentIdsMissingFromLegacyArray: missingLegacyIds
      });
      continue;
    }
    safeToClean.push(task._id);
  }

  // Refuse all changes if any mirror disagrees, rather than silently losing an assignee.
  if (mismatches.length) {
    console.error(JSON.stringify({
      reviewed,
      safeToClean: safeToClean.length,
      mismatchedTasks: mismatches.length,
      samples: mismatches.slice(0, 20)
    }, null, 2));
    throw new Error("TASK_ASSIGNEE_SOURCE_DRIFT: reconcile the listed Task and TaskAssignment records before removing the mirror array.");
  }

  let cleaned = 0;
  for (let i = 0; i < safeToClean.length; i += 500) {
    const batch = safeToClean.slice(i, i + 500);
    const result = await tasks.updateMany(
      { _id: { $in: batch }, assigneeUserIds: { $exists: true } },
      { $unset: { assigneeUserIds: "" } }
    );
    cleaned += result.modifiedCount;
  }

  const remainingLegacyFields = await tasks.countDocuments({ assigneeUserIds: { $exists: true } });
  console.log(JSON.stringify({
    reviewed,
    taskRecordsCleaned: cleaned,
    remainingLegacyFields
  }, null, 2));

  if (remainingLegacyFields) {
    throw new Error("TASK_ASSIGNEE_ARRAYS_REMAIN: rerun the migration after resolving database write failures.");
  }
} finally {
  await mongoose.disconnect();
}
