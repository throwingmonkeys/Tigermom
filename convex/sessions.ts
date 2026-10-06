import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v, ConvexError } from "convex/values";
import { internal } from "./_generated/api";

const LEASE = 5 * 60_000;
export async function ownedSession(
  ctx: QueryCtx | MutationCtx,
  sessionId: Id<"sessions">,
) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError("Sign in before starting a conversation.");
  const session = await ctx.db.get(sessionId);
  if (
    !session ||
    session.userId !== userId ||
    session.ended ||
    session.expiresAt <= Date.now()
  )
    throw new ConvexError(
      "Your session has ended. Please start a new conversation.",
    );
  return session;
}
async function erase(ctx: MutationCtx, sessionId: Id<"sessions">) {
  const reports = await ctx.db
    .query("reports")
    .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
    .take(4);
  for (const report of reports) {
    await ctx.storage.delete(report.storageId);
    await ctx.db.delete(report._id);
  }
  await ctx.db.delete(sessionId);
}
export const begin = mutation({
  args: {},
  returns: v.id("sessions"),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Please verify your phone first.");
    const previous = await ctx.db
      .query("sessions")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(10);
    for (const session of previous) await erase(ctx, session._id);
    const id = await ctx.db.insert("sessions", {
      userId,
      expiresAt: Date.now() + LEASE,
      ended: false,
      calls: 0,
      lastCallAt: 0,
      inFlight: false,
    });
    await ctx.scheduler.runAfter(LEASE, internal.sessions.expire, {
      sessionId: id,
    });
    return id;
  },
});
export const heartbeat = mutation({
  args: { sessionId: v.id("sessions") },
  returns: v.null(),
  handler: async (ctx, { sessionId }) => {
    await ownedSession(ctx, sessionId);
    await ctx.db.patch(sessionId, { expiresAt: Date.now() + LEASE });
    return null;
  },
});
export const finish = mutation({
  args: { sessionId: v.id("sessions") },
  returns: v.null(),
  handler: async (ctx, { sessionId }) => {
    const userId = await getAuthUserId(ctx);
    const session = await ctx.db.get(sessionId);
    if (!session) return null;
    if (!userId || session.userId !== userId)
      throw new ConvexError("This conversation belongs to someone else.");
    await erase(ctx, sessionId);
    return null;
  },
});
export const expire = internalMutation({
  args: { sessionId: v.id("sessions") },
  returns: v.null(),
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) return null;
    if (session.expiresAt <= Date.now()) await erase(ctx, sessionId);
    else
      await ctx.scheduler.runAfter(
        session.expiresAt - Date.now(),
        internal.sessions.expire,
        { sessionId },
      );
    return null;
  },
});
export const claim = internalMutation({
  args: { sessionId: v.id("sessions") },
  returns: v.null(),
  handler: async (ctx, { sessionId }) => {
    const session = await ownedSession(ctx, sessionId);
    if (
      session.inFlight ||
      Date.now() - session.lastCallAt < 3000 ||
      session.calls >= 30
    )
      throw new ConvexError(
        "Please pause a moment, or start a new conversation if you have reached the session limit.",
      );
    await ctx.db.patch(sessionId, {
      calls: session.calls + 1,
      lastCallAt: Date.now(),
      inFlight: true,
      expiresAt: Date.now() + LEASE,
    });
    return null;
  },
});
export const release = internalMutation({
  args: { sessionId: v.id("sessions") },
  returns: v.null(),
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get(sessionId);
    if (session) await ctx.db.patch(sessionId, { inFlight: false });
    return null;
  },
});
export const files = internalQuery({
  args: { sessionId: v.id("sessions") },
  returns: v.array(
    v.object({
      storageId: v.id("_storage"),
      mimeType: v.string(),
      name: v.string(),
    }),
  ),
  handler: async (ctx, { sessionId }) => {
    await ownedSession(ctx, sessionId);
    const reports = await ctx.db
      .query("reports")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .take(3);
    return reports.map(({ storageId, mimeType, name }) => ({
      storageId,
      mimeType,
      name,
    }));
  },
});
