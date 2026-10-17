import { RateLimiter, HOUR } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { ownedSession } from "./sessions";

const limiter = new RateLimiter(components.rateLimiter, {
  aiCalls: { kind: "fixed window", rate: 100, period: HOUR },
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
