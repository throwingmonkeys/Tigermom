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
  // Legacy rows exist only for authorised deletion; v1 has no upload writers.
  reports: defineTable({
    sessionId: v.id("sessions"),
    userId: v.id("users"),
    storageId: v.id("_storage"),
    name: v.string(),
    mimeType: v.string(),
    extractedText: v.optional(v.string()),
    extractionVersion: v.optional(v.number()),
  }).index("by_sessionId", ["sessionId"]),
  responseVotes: defineTable({
    sessionId: v.id("sessions"), responseKey: v.string(),
    vote: v.union(v.literal("like"), v.literal("dislike")),
    category: v.string(), version: v.number(),
  }).index("by_response", ["sessionId", "responseKey"])
    .index("by_sessionId", ["sessionId"]),
  surveyReceipts: defineTable({ token: v.string(), expiresAt: v.number(), submitted: v.boolean() }).index("by_token", ["token"]),
  feedbackTotals: defineTable({ key: v.string(), count: v.number() }).index("by_key", ["key"]),
});
