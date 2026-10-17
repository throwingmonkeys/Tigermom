import { describe, it, expect, vi, afterEach } from "vitest";
import { acceptPurposeReview, reviewBlockedMessage } from "../convex/purposeReview";
import { convexTest } from "convex-test";
import { Agent } from "@convex-dev/agent";
import rateLimiter from "@convex-dev/rate-limiter/test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
const modules = import.meta.glob("../convex/**/*.{ts,js}");
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

const checks = { purpose: true, perspective: true, relevance: true, safety: true, evidence: true, tone: true };
describe("Required purpose review", () => {
  it("rejects a definition that exceeds its shorter explanation allowance", () => {
    expect(acceptPurposeReview(JSON.stringify({ decision: "revise", text: "word ".repeat(41), checks }), 0, false, [], 40)).toBeNull();
  });
  it("accepts only a reviewed answer with every check passed", () => {
    expect(acceptPurposeReview(JSON.stringify({ decision: "approve", text: "I'm here with you.", checks }), 0, false)).toBe("I'm here with you.");
  });
  it.each(Object.keys(checks))("blocks a failed %s check even if the verdict says approve", key => {
    expect(acceptPurposeReview(JSON.stringify({ decision: "approve", text: "Unreviewed draft", checks: { ...checks, [key]: false } }), 0, false)).toBeNull();
  });
  it.each(["not JSON", "{}", JSON.stringify({ decision: "block", text: "Bad draft", checks })])("rejects missing or blocked review: %s", raw => {
    expect(acceptPurposeReview(raw, 0, false)).toBeNull();
  });
  it("accepts a revision only with all checks passed and valid references", () => {
    expect(acceptPurposeReview(JSON.stringify({ decision: "revise", text: "Continuity means care from the same midwife or team [1].", checks }), 1, false)).toContain("[1]");
    expect(acceptPurposeReview(JSON.stringify({ decision: "revise", text: "Invented claim [2].", checks }), 1, false)).toBeNull();
  });
  it("never drops required consultation wording or accepts provider markers", () => {
    expect(acceptPurposeReview(JSON.stringify({ decision: "approve", text: "Some options [1].", checks }), 1, true)).toBeNull();
    expect(acceptPurposeReview(JSON.stringify({ decision: "approve", text: "Claim turn0search0", checks }), 1, false)).toBeNull();
  });
  it("blocks removed citations and references to organisations absent from checked sources", () => {
    const sources = [{ title: "Cochrane", url: "https://www.cochrane.org/evidence/example" }];
    expect(acceptPurposeReview(JSON.stringify({ decision: "revise", text: "Medical claim without reference.", checks }), 1, false, sources)).toBeNull();
    expect(acceptPurposeReview(JSON.stringify({ decision: "revise", text: "NICE supports this claim [1].", checks }), 1, false, sources)).toBeNull();
  });
});

describe("Review before release", () => {
  async function setup() {
    vi.stubEnv("OPENAI_API_KEY", "synthetic-test-placeholder");
    vi.stubEnv("AI_ENABLED", "true");
    const t = convexTest(schema, modules);
    rateLimiter.register(t);
    const userId = await t.run(ctx => ctx.db.insert("users", {}));
    const owner = t.withIdentity({ subject: `${userId}|session` });
    const sessionId = await owner.mutation(api.sessions.begin, {});
    return { t, owner, sessionId };
  }
  it("returns only the reviewed revision, never the poor draft", async () => {
    const f = await setup();
    const generate = vi.spyOn(Agent.prototype, "generateText")
      .mockResolvedValueOnce({ text: "At least you can try again.", finishReason: "stop" } as never)
      .mockResolvedValueOnce({ text: JSON.stringify({ decision: "revise", text: "I'm sorry for your loss. You don't have to explain anything.", checks }), finishReason: "stop" } as never);
    const result = await f.owner.action(api.conversation.reply, { sessionId: f.sessionId, text: "I've had a pregnancy loss. I just need someone to speak kindly to me.", history: [] });
    expect(result.text).toBe("I'm sorry for your loss. You don't have to explain anything.");
    expect(generate.mock.calls[1][2]).toMatchObject({ toolChoice: "none", maxRetries: 0, maxOutputTokens: 500 });
    expect(JSON.stringify(generate.mock.calls[1][2])).toContain("At least you can try again");
    expect(await f.t.run(async ctx => (await ctx.db.get(f.sessionId))?.calls)).toBe(2);
  });
  it.each(["malformed", JSON.stringify({ decision: "approve", text: "Unsafe draft", checks: { ...checks, safety: false } })])("blocks an invalid review: %s", async raw => {
    const f = await setup();
    vi.spyOn(Agent.prototype, "generateText")
      .mockResolvedValueOnce({ text: "Poor draft", finishReason: "stop" } as never)
      .mockResolvedValueOnce({ text: raw, finishReason: "stop" } as never);
    const result = await f.owner.action(api.conversation.reply, { sessionId: f.sessionId, text: "I just need to vent.", history: [] });
    expect(result).toMatchObject({ text: reviewBlockedMessage, sources: [] });
    expect(result.reviewDiagnostic).toBeTruthy();
    expect(result.reviewDiagnostic).not.toContain("Unsafe draft");
  });
  it("does not release the draft if the reviewer fails", async () => {
    const f = await setup();
    const generate = vi.spyOn(Agent.prototype, "generateText")
      .mockResolvedValueOnce({ text: "Unreviewed draft", finishReason: "stop" } as never)
      .mockRejectedValueOnce(new Error("synthetic review timeout"));
    const result = await f.owner.action(api.conversation.reply, { sessionId: f.sessionId, text: "I just need to vent.", history: [] });
    expect(result.text).toBe("Busy right now. Try again in a few minutes.");
    expect(generate).toHaveBeenCalledTimes(2);
  });
  it("does not send a late reviewed answer after deletion", async () => {
    const f = await setup();
    vi.spyOn(Agent.prototype, "generateText")
      .mockResolvedValueOnce({ text: "Draft", finishReason: "stop" } as never)
      .mockImplementationOnce(async () => {
        await f.owner.mutation(api.sessions.finish, { sessionId: f.sessionId });
        return { text: JSON.stringify({ decision: "approve", text: "Late answer", checks }), finishReason: "stop" } as never;
      });
    const result = await f.owner.action(api.conversation.reply, { sessionId: f.sessionId, text: "I just need to vent.", history: [] });
    expect(result.text).not.toContain("Late answer");
    expect(await f.t.run(ctx => ctx.db.get(f.sessionId))).toBeNull();
  });
  it("reserves each session call and stops review when the allowance is exhausted", async () => {
    const f = await setup();
    await f.t.run(ctx => ctx.db.patch(f.sessionId, { calls: 19 }));
    const generate = vi.spyOn(Agent.prototype, "generateText").mockResolvedValueOnce({ text: "Unreviewed draft", finishReason: "stop" } as never);
    const result = await f.owner.action(api.conversation.reply, { sessionId: f.sessionId, text: "I just need to vent.", history: [] });
    expect(result.text).not.toContain("Unreviewed draft");
    expect(generate).toHaveBeenCalledTimes(1);
    expect(await f.t.run(async ctx => (await ctx.db.get(f.sessionId))?.calls)).toBe(20);
  });
  it("does not require any review for urgent guidance", async () => {
    const f = await setup();
    const generate = vi.spyOn(Agent.prototype, "generateText");
    const result = await f.owner.action(api.conversation.reply, { text: "I have severe pain", history: [] });
    expect(result.text).toContain("medical attention right away");
    expect(generate).not.toHaveBeenCalled();
  });
});
