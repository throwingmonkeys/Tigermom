import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

export default defineSchema({
  ...authTables,
  aiBudget: defineTable({ key: v.string(), calls: v.array(v.number()) })
    .index("by_key", ["key"]),
  sessions: defineTable({
    userId: v.id("users"),
    expiresAt: v.number(),
    ended: v.boolean(),
    calls: v.number(),
    lastCallAt: v.number(),
    inFlight: v.boolean(),
  })
    .index("by_userId", ["userId"])
    .index("by_expiresAt", ["expiresAt"]),
  reports: defineTable({
    sessionId: v.id("sessions"),
    userId: v.id("users"),
    storageId: v.id("_storage"),
    name: v.string(),
    mimeType: v.string(),
  }).index("by_sessionId", ["sessionId"]),
});
