import mongoose from "mongoose";

declare global {
  var __conventusMongo: Promise<typeof mongoose> | undefined;
}

export async function getMongo() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("MONGODB_URI is not configured");
  }

  if (mongoose.connection.readyState === 1) return mongoose;

  globalThis.__conventusMongo ??= mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000,
    maxPoolSize: 20,
    minPoolSize: 2
  });

  return globalThis.__conventusMongo;
}