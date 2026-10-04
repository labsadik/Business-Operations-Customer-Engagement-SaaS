import mongoose from "mongoose";

declare global {
  var __conventusMongo: Promise<typeof mongoose> | undefined;
}

export async function getMongo() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("MONGODB_URI is not configured");
  }

  const databaseName = "Conventus";

  if (mongoose.connection.readyState === 1) {
    if (mongoose.connection.db?.databaseName === databaseName) return mongoose;
    await mongoose.disconnect();
    globalThis.__conventusMongo = undefined;
  }

  globalThis.__conventusMongo ??= mongoose.connect(uri, {
    dbName: databaseName,
    serverSelectionTimeoutMS: 5000,
    maxPoolSize: 20,
    minPoolSize: 2
  });

  return globalThis.__conventusMongo;
}