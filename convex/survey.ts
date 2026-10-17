import { mutation, internalMutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";

export const submit = mutation({
  args: { token: v.string(), useful: v.boolean(), reason: v.union(v.literal("I feel clearer"), v.literal("I feel more confident"), v.literal("I still have questions"), v.literal("Something felt wrong")) },
  returns: v.null(),
  handler: async (ctx, { token, useful, reason }) => {
    const receipt = await ctx.db.query("surveyReceipts").withIndex("by_token", q => q.eq("token", token)).unique();
    if (!receipt || receipt.expiresAt <= Date.now()) throw new ConvexError("This feedback form has expired. You can skip feedback to return home.");
    if (receipt.submitted) return null;
    // Anonymous totals only: no session, visitor or conversation is retained.
    const key = `survey:${useful ? "helpful" : "not_helpful"}:${reason}`;
    const total = await ctx.db.query("feedbackTotals").withIndex("by_key", q => q.eq("key", key)).unique();
    if (total) await ctx.db.patch(total._id, { count: total.count + 1 });
    else await ctx.db.insert("feedbackTotals", { key, count: 1 });
    await ctx.db.patch(receipt._id, { submitted: true });
    return null;
  },
});
export const removeReceipt = internalMutation({
  args: { receiptId: v.id("surveyReceipts") }, returns: v.null(),
  handler: async (ctx, { receiptId }) => { if (await ctx.db.get(receiptId)) await ctx.db.delete(receiptId); return null; },
});
