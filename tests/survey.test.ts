import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
const modules = import.meta.glob("../convex/**/*.{ts,js}");
describe("End-of-session survey", () => {
  it("deletes session content, accepts a receipt after sign-out, and counts retries once", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(ctx => ctx.db.insert("users", {}));
    const owner = t.withIdentity({ subject: `${userId}|session` });
    const sessionId = await owner.mutation(api.sessions.begin, {});
    const token = "a".repeat(64);
    await owner.mutation(api.sessions.finish, { sessionId, surveyToken: token });
    expect(await t.run(ctx => ctx.db.get(sessionId))).toBeNull();
    const args = { token, useful: false, reason: "Something felt wrong" as const };
    await t.mutation(api.survey.submit, args);
    await t.mutation(api.survey.submit, args);
    const rows = await t.run(ctx => ctx.db.query("feedbackTotals").withIndex("by_key", q => q.eq("key", "survey:not_helpful:Something felt wrong")).take(2));
    expect(rows).toHaveLength(1);
    expect(rows[0].count).toBe(1);
    const receipt = await t.run(ctx => ctx.db.query("surveyReceipts").withIndex("by_token", q => q.eq("token", token)).unique());
    expect(receipt).not.toHaveProperty("userId");
    await t.mutation(internal.survey.removeReceipt, { receiptId: receipt!._id });
    await expect(t.mutation(api.survey.submit, args)).rejects.toThrow("expired");
  });
  it("rejects invented and expired receipts", async () => {
    const t = convexTest(schema, modules);
    const token = "b".repeat(64);
    const args = { token, useful: true, reason: "I feel clearer" as const };
    await expect(t.mutation(api.survey.submit, args)).rejects.toThrow("expired");
    await t.run(ctx => ctx.db.insert("surveyReceipts", { token, expiresAt: Date.now() - 1, submitted: false }));
    await expect(t.mutation(api.survey.submit, args)).rejects.toThrow("expired");
  });
});
