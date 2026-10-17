import { describe, it, expect, vi, afterEach } from "vitest";
import { convexTest } from "convex-test";
import { Agent } from "@convex-dev/agent";
import rateLimiter from "@convex-dev/rate-limiter/test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
const modules = import.meta.glob("../convex/**/*.{ts,js}");
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
async function setup() {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  const userId = await t.run(ctx => ctx.db.insert("users", {}));
  const owner = t.withIdentity({ subject: `${userId}|session` });
  const sessionId = await owner.mutation(api.sessions.begin, {});
  return { t, owner, sessionId };
}
describe("Private one-tap response feedback", () => {
  it.each(["exhausted", "provider_failure"])("keeps the vote when classification is unavailable: %s", async mode => {
    vi.stubEnv("AI_ENABLED", "true"); vi.stubEnv("OPENAI_API_KEY", "synthetic-test-placeholder");
    const f = await setup();
    const generate = vi.spyOn(Agent.prototype, "generateText").mockRejectedValue(new Error("synthetic failure"));
    if (mode === "exhausted") await f.t.run(ctx => ctx.db.patch(f.sessionId, { calls: 20 }));
    await f.owner.action(api.feedback.submit, { sessionId: f.sessionId, responseKey: "response-1", vote: "dislike", question: "Hello", answer: "Synthetic answer" });
    const [row] = await f.t.run(ctx => ctx.db.query("responseVotes").withIndex("by_sessionId", q => q.eq("sessionId", f.sessionId)).take(1));
    expect(row.category).toBe("negative_unspecified");
    expect(generate).toHaveBeenCalledTimes(mode === "exhausted" ? 0 : 1);
  });
  it("saves without AI, deduplicates, and replaces a vote without inflating totals", async () => {
    vi.stubEnv("AI_ENABLED", "false");
    const f = await setup();
    const args = { sessionId: f.sessionId, responseKey: "response-1", vote: "like" as const, question: "Synthetic private question", answer: "Synthetic private reply" };
    await f.owner.action(api.feedback.submit, args);
    await f.owner.action(api.feedback.submit, args);
    await f.owner.action(api.feedback.submit, { ...args, vote: "dislike" });
    const totals = await f.t.run(ctx => ctx.db.query("feedbackTotals").withIndex("by_key").take(50));
    expect(totals.reduce((sum, row) => sum + row.count, 0)).toBe(1);
    expect(totals.find(row => row.key === "dislike:negative_unspecified")?.count).toBe(1);
    const events = await f.t.run(ctx => ctx.db.query("responseVotes").withIndex("by_sessionId", q => q.eq("sessionId", f.sessionId)).take(5));
    expect(JSON.stringify([...totals, ...events])).not.toContain("Synthetic private");
  });
  it("rejects another visitor and removes session-linked votes on deletion, retaining only anonymous counts", async () => {
    const f = await setup();
    const otherId = await f.t.run(ctx => ctx.db.insert("users", {}));
    const other = f.t.withIdentity({ subject: `${otherId}|session` });
    const args = { sessionId: f.sessionId, responseKey: "response-1", vote: "like" as const };
    await expect(other.mutation(internal.feedbackData.record, args)).rejects.toThrow();
    await f.owner.mutation(internal.feedbackData.record, args);
    await f.owner.mutation(api.sessions.finish, { sessionId: f.sessionId });
    expect(await f.t.run(ctx => ctx.db.query("responseVotes").withIndex("by_sessionId", q => q.eq("sessionId", f.sessionId)).take(5))).toHaveLength(0);
    expect((await f.t.run(ctx => ctx.db.query("feedbackTotals").withIndex("by_key").take(50))).reduce((sum, row) => sum + row.count, 0)).toBe(1);
  });
  it("does not let a late classification overwrite a changed vote", async () => {
    const f = await setup();
    const args = { sessionId: f.sessionId, responseKey: "response-1" };
    const old = await f.owner.mutation(internal.feedbackData.record, { ...args, vote: "like" });
    await f.owner.mutation(internal.feedbackData.record, { ...args, vote: "dislike" });
    await f.owner.mutation(internal.feedbackData.classify, { ...args, version: old.version, category: "supportive_tone" });
    const [row] = await f.t.run(ctx => ctx.db.query("responseVotes").withIndex("by_response", q => q.eq("sessionId", f.sessionId).eq("responseKey", args.responseKey)).take(1));
    expect(row.category).toBe("negative_unspecified");
  });
  it("classifies privately with no search and no stored conversation content", async () => {
    vi.stubEnv("AI_ENABLED", "true"); vi.stubEnv("OPENAI_API_KEY", "synthetic-test-placeholder");
    const f = await setup();
    const generate = vi.spyOn(Agent.prototype, "generateText").mockResolvedValue({ text: '{"category":"supportive_tone"}', finishReason: "stop" } as never);
    await f.owner.action(api.feedback.submit, { sessionId: f.sessionId, responseKey: "response-1", vote: "like", question: "Hello", answer: "I'm here to listen." });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0][2]).toMatchObject({ toolChoice: "none", maxRetries: 0 });
    expect(await f.t.run(async ctx => (await ctx.db.get(f.sessionId))?.calls)).toBe(1);
    const [row] = await f.t.run(ctx => ctx.db.query("responseVotes").withIndex("by_sessionId", q => q.eq("sessionId", f.sessionId)).take(1));
    expect(row.category).toBe("supportive_tone");
  });
});
