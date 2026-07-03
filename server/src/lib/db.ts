import mongoose from "mongoose";
import { env } from "@/config/env.js";
import { logger } from "@/lib/logger.js";

mongoose.set("strictQuery", true);

/**
 * Connect to MongoDB. Always targets a DEDICATED database (env.MONGODB_DB),
 * never another app's database.
 */
export async function connectDb(uri: string = env.MONGODB_URI, dbName: string = env.MONGODB_DB) {
  await mongoose.connect(uri, {
    dbName,
    // Standalone MongoDB reached over an SSH tunnel: connect directly to the
    // single host without topology discovery (no replica set to discover).
    directConnection: true,
    serverSelectionTimeoutMS: 8000,
    maxPoolSize: 20,
  });
  logger.info({ db: dbName }, "MongoDB connected");
  return mongoose.connection;
}

export async function disconnectDb() {
  await mongoose.disconnect();
}

/** True when the connected MongoDB supports multi-document transactions (replica set / mongos). */
export async function supportsTransactions(): Promise<boolean> {
  try {
    const admin = mongoose.connection.db?.admin();
    if (!admin) return false;
    const hello = await admin.command({ hello: 1 });
    return Boolean(hello.setName || hello.msg === "isdbgrid");
  } catch {
    return false;
  }
}
