import { v, ConvexError } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { ownedSession } from "./sessions";

export const positiveCategories = ["clear_explanation", "answered_question", "supportive_tone", "useful_evidence", "empowering", "helpful_unspecified"];
export const negativeCategories = ["off_topic", "not_answering_question", "irrelevant_evidence", "unclear", "contradictory", "overly_medicalised", "fear_inducing", "dismissive", "too_long", "repetitive", "missed_context", "missing_midwifery_perspective", "unsupported_claim", "unhelpful_refusal", "negative_unspecified"];
export const voteValidator = v.union(v.literal("like"), v.literal("dislike"));
async function adjust(ctx: MutationCtx, key: string, delta: number) {
  const total = await ctx.db.query("feedbackTotals").withIndex("by_key", q => q.eq("key", key)).unique();
  if (total) await ctx.db.patch(total._id, { count: Math.max(0, total.count + delta) });
  else if (delta > 0) await ctx.db.insert("feedbackTotals", { key, count: delta });
}
export const record = internalMutation({
  args: { sessionId: v.id("sessions"), responseKey: v.string(), vote: voteValidator },
  returns: v.object({ version: v.number(), changed: v.boolean() }),
  handler: async (ctx, args) => {
    await ownedSession(ctx, args.sessionId);
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(args.responseKey)) throw new ConvexError("Invalid response");
    const old = await ctx.db.query("responseVotes").withIndex("by_response", q => q.eq("sessionId", args.sessionId).eq("responseKey", args.responseKey)).unique();
    if (old?.vote === args.vote) return { version: old.version, changed: false };
    const count = await ctx.db.query("responseVotes").withIndex("by_sessionId", q => q.eq("sessionId", args.sessionId)).take(61);
    if (!old && count.length >= 60) throw new ConvexError("Feedback allowance used");
    const category = args.vote === "like" ? "helpful_unspecified" : "negative_unspecified";
    const version = (old?.version ?? 0) + 1;
    if (old) {
      await adjust(ctx, `${old.vote}:${old.category}`, -1);
      await ctx.db.patch(old._id, { vote: args.vote, category, version });
    } else await ctx.db.insert("responseVotes", { ...args, category, version });
    await adjust(ctx, `${args.vote}:${category}`, 1);
    return { version, changed: true };
  },
});
export const classify = internalMutation({
  args: { sessionId: v.id("sessions"), responseKey: v.string(), version: v.number(), category: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ownedSession(ctx, args.sessionId);
    const old = await ctx.db.query("responseVotes").withIndex("by_response", q => q.eq("sessionId", args.sessionId).eq("responseKey", args.responseKey)).unique();
    if (!old || old.version !== args.version) return null;
    if (!(old.vote === "like" ? positiveCategories : negativeCategories).includes(args.category)) return null;
    await adjust(ctx, `${old.vote}:${old.category}`, -1);
    await ctx.db.patch(old._id, { category: args.category });
    await adjust(ctx, `${old.vote}:${args.category}`, 1);
    return null;
  },
});
