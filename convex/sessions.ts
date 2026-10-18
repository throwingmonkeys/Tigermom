import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v, ConvexError } from "convex/values";
import { internal } from "./_generated/api";

const LEASE = 5 * 60_000;
const SESSION_LENGTH = 10 * 60_000;
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
    session.expiresAt <= Date.now() ||
    session._creationTime + SESSION_LENGTH <= Date.now()
  )
    throw new ConvexError(
      "Your session has ended. You can start another session now.",
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
  const votes = await ctx.db.query("responseVotes").withIndex("by_sessionId", q => q.eq("sessionId", sessionId)).take(100);
  for (const vote of votes) await ctx.db.delete(vote._id);
  await ctx.db.delete(sessionId);
}
export const begin = mutation({
  args: {},
  returns: v.id("sessions"),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId)
      throw new ConvexError("Please start a private guest session first.");
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
    const session = await ownedSession(ctx, sessionId);
    await ctx.db.patch(sessionId, {
      expiresAt: Math.min(Date.now() + LEASE, session._creationTime + SESSION_LENGTH),
    });
    return null;
  },
});
export const finish = mutation({
  args: { sessionId: v.id("sessions"), surveyToken: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { sessionId, surveyToken }) => {
    const userId = await getAuthUserId(ctx);
    const session = await ctx.db.get(sessionId);
    if (!userId || (session && session.userId !== userId))
      throw new ConvexError("This conversation belongs to someone else.");
    if (surveyToken) {
      if (!/^[a-f0-9]{64}$/.test(surveyToken)) throw new ConvexError("Invalid feedback receipt.");
      const existing = await ctx.db.query("surveyReceipts").withIndex("by_token", q => q.eq("token", surveyToken)).unique();
      if (!existing) {
        const receiptId = await ctx.db.insert("surveyReceipts", { token: surveyToken, expiresAt: Date.now() + 60 * 60_000, submitted: false });
        await ctx.scheduler.runAfter(60 * 60_000, internal.survey.removeReceipt, { receiptId });
      }
    }
    if (session) await erase(ctx, sessionId);
    return null;
  },
});
export const expire = internalMutation({
  args: { sessionId: v.id("sessions") },
  returns: v.null(),
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) return null;
    const deadline = Math.min(session.expiresAt, session._creationTime + SESSION_LENGTH);
    if (deadline <= Date.now()) await erase(ctx, sessionId);
    else
      await ctx.scheduler.runAfter(
        deadline - Date.now(),
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
    if (session.calls >= 20)
      throw new ConvexError("Your session has ended. You can start another session now.");
    if (session.inFlight)
      throw new ConvexError("Your previous question is still being answered. Please wait for its reply.");
    if (Date.now() - session.lastCallAt < 3000)
      throw new ConvexError("Please wait three seconds before sending another question.");
    await ctx.db.patch(sessionId, {
      lastCallAt: Date.now(),
      inFlight: true,
      expiresAt: Math.min(Date.now() + LEASE, session._creationTime + SESSION_LENGTH),
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
// Lifecycle guard for text/voice work. This never reads or returns a report.
export const assertActive = internalQuery({
  args: { sessionId: v.id("sessions") }, returns: v.null(),
  handler: async (ctx, { sessionId }) => { await ownedSession(ctx, sessionId); return null; },
});
