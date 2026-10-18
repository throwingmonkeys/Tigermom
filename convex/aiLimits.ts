import { RateLimiter, HOUR } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { ownedSession } from "./sessions";

const limiter = new RateLimiter(components.rateLimiter, {
  aiCalls: { kind: "fixed window", rate: 100, period: HOUR },
});

export function returnTime(time: number): string {
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }).format(time) + " IST (Asia/Kolkata)";
}

// Read after a refused reservation; do not turn an exhausted allowance into
// a temporary provider failure. This query never changes the allowance.
export const unavailableMessage = internalQuery({
  args: { sessionId: v.id("sessions") }, returns: v.string(),
  handler: async (ctx, { sessionId }) => {
    const session = await ownedSession(ctx, sessionId);
    const budget = await ctx.db.query("aiBudget").withIndex("by_key", q => q.eq("key", "global")).unique();
    const calls = (budget?.calls ?? []).filter(time => time > Date.now() - HOUR).sort((a, b) => a - b);
    if (calls.length >= 100)
      return `Tigermom’s hourly allowance is used up. You can try again at ${returnTime(calls[calls.length - 100] + HOUR)}.`;
    if (session.calls >= 20) return "Your session has ended. You can start another session now.";
    return `Tigermom’s hourly allowance is used up. You can try again at ${returnTime(Date.now() + HOUR)}.`;
  },
});

// One shared reservation, committed before each provider call. The rolling
// guard prevents two adjacent fixed windows allowing more than 100 in an hour.
export const reserve = internalMutation({
  args: { sessionId: v.optional(v.id("sessions")) },
  returns: v.boolean(),
  handler: async (ctx, { sessionId }) => {
    const session = sessionId ? await ownedSession(ctx, sessionId) : null;
    if (session && session.calls >= 20) return false;
    const now = Date.now();
    const budget = await ctx.db.query("aiBudget")
      .withIndex("by_key", q => q.eq("key", "global" )).unique();
    const calls = (budget?.calls ?? []).filter(time => time > now - HOUR);
    if (calls.length >= 100) return false;
    const status = await limiter.limit(ctx, "aiCalls");
    if (!status.ok) return false;
    calls.push(now);
    if (budget) await ctx.db.patch(budget._id, { calls });
    else await ctx.db.insert("aiBudget", { key: "global", calls });
    if (sessionId && session) await ctx.db.patch(sessionId, { calls: session.calls + 1 });
    return true;
  },
});
