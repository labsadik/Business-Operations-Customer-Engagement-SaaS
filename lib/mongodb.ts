import mongoose from "mongoose";

declare global {
  var __conventusMongo: Promise<typeof mongoose> | undefined;
}

function resetMongoCache(connectionPromise?: Promise<typeof mongoose>) {
  if (
    !connectionPromise ||
    globalThis.__conventusMongo === connectionPromise
  ) {
    globalThis.__conventusMongo = undefined;
  }
}

export async function getMongo() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("MONGODB_URI is not configured");
  }

  const databaseName = process.env.MONGODB_DB_NAME?.trim() || "Conventus";

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
      bufferCommands: false,
      // Dashboard SSR and its independent API reads need a little parallelism;
      // keep the pool small enough for serverless instances.
      maxPoolSize: 5,
      minPoolSize: 0,
      // Always encrypt app-to-database traffic in production. MongoDB Atlas
      // enables TLS by default too; this makes the application's requirement explicit.
      ...(process.env.NODE_ENV === "production" ? { tls: true } : {}),
      waitQueueTimeoutMS: 5000,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 10000
    });

    globalThis.__conventusMongo = connectionPromise;

    connectionPromise.catch(() => {
      resetMongoCache(connectionPromise);
    });

    mongoose.connection.once("disconnected", () => {
      resetMongoCache(connectionPromise);
    });

    mongoose.connection.once("error", () => {
      resetMongoCache(connectionPromise);
    });
  }

  return globalThis.__conventusMongo;
}
