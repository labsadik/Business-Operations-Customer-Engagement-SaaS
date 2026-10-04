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

  // Reuse only an in-flight connection. A disconnected or failed connection
  // must not leave a stale resolved promise in the global cache.
  if (mongoose.connection.readyState !== 2) {
    globalThis.__conventusMongo = undefined;
  }

  if (!globalThis.__conventusMongo) {
    const connectionPromise = mongoose.connect(uri, {
      dbName: databaseName,
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 20,
      minPoolSize: 2
    });

    globalThis.__conventusMongo = connectionPromise;
    connectionPromise.catch(() => {
      if (globalThis.__conventusMongo === connectionPromise) {
        globalThis.__conventusMongo = undefined;
      }
    });
  }

  return globalThis.__conventusMongo;
}