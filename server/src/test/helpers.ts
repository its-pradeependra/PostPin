import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose, { Types } from "mongoose";
import type { RequestContext } from "@/context/request-context.js";

let mongod: MongoMemoryServer | null = null;

/** Spin up an in-memory MongoDB and connect mongoose to it. */
export async function startMemoryDb(): Promise<void> {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: "postpin_test" });
}

export async function stopMemoryDb(): Promise<void> {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
  mongod = null;
}

export async function clearCollections(): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) return;
  const cols = await db.collections();
  await Promise.all(cols.map((c) => c.deleteMany({})));
}

/** Build a fake request context for unit tests. */
export function makeContext(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    requestId: "test-req",
    userId: new Types.ObjectId(),
    companyId: new Types.ObjectId(),
    roleKey: "owner",
    isPlatformStaff: false,
    permissions: new Set<string>(),
    permVersion: 1,
    sessionId: "test-session",
    ip: "127.0.0.1",
    userAgent: "vitest",
    ...overrides,
  };
}
