import { describe, it, expect, vi, afterEach } from "vitest";
import { convexTest } from "convex-test";
import { Agent } from "@convex-dev/agent";
import rateLimiter from "@convex-dev/rate-limiter/test";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
import { acceptSearchQuestion } from "../convex/searchQuestion";
const modules = import.meta.glob("../convex/**/*.{ts,js}");
const plan = (question: string) => JSON.stringify({ question, privateDetailsRemoved: true, intentPreserved: true });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
describe("Private contextual search preparation", () => {
  it.each(["not JSON", plan("Search patient record 12345"), plan("Email someone@example.test"), plan("Open https://example.test"), JSON.stringify({ question: "What is labour?", privateDetailsRemoved: false, intentPreserved: true })])("rejects unsafe or incomplete preparation: %s", raw => {
    expect(acceptSearchQuestion(raw)).toBeNull();
  });
  it("accepts a full general question rather than forcing broad keywords", () => {
    expect(acceptSearchQuestion(plan("How does the duration of early labour differ between first and subsequent births?"))).toContain("duration of early labour");
  });
  async function setup() {
    vi.stubEnv("OPENAI_API_KEY", "synthetic-test-placeholder"); vi.stubEnv("AI_ENABLED", "true");
    const t = convexTest(schema, modules); rateLimiter.register(t);
    const userId = await t.run(ctx => ctx.db.insert("users", {}));
    const owner = t.withIdentity({ subject: `${userId}|session` });
    const sessionId = await owner.mutation(api.sessions.begin, {});
    return { t, owner, sessionId };
  }
  it("keeps original context private and sends only the prepared question to research", async () => {
    const f = await setup();
    const question = "How long does childbirth take in a subsequent birth?";
    const answer = "Labour duration varies [1].";
    const generate = vi.spyOn(Agent.prototype, "generateText")
      .mockResolvedValueOnce({ text: plan(question), finishReason: "stop" } as never)
      .mockResolvedValueOnce({ text: "Duration varies.", sources: [{ sourceType: "url", title: "NICE", url: "https://www.nice.org.uk/guidance/ng235" }] } as never)
      .mockResolvedValueOnce({ text: answer, finishReason: "stop" } as never)
      .mockResolvedValueOnce({ text: JSON.stringify({ decision: "approve", text: answer, checks: { purpose: true, perspective: true, relevance: true, safety: true, evidence: true, tone: true } }), finishReason: "stop" } as never);
    const result = await f.owner.action(api.conversation.reply, { sessionId: f.sessionId, text: "And the second time?", history: [{ role: "user", text: "Fictional Luma Example reference ZXPRIVATE123 asked how long childbirth takes." }] });
    expect(result.text).toBe(answer);
    const privateStep = generate.mock.calls[0][2];
    expect(privateStep.toolChoice).toBe("none");
    expect(JSON.stringify(privateStep)).toContain("And the second time?");
    expect(JSON.stringify(privateStep)).toContain("ZXPRIVATE123");
    const research = generate.mock.calls[1][2];
    expect(research.messages).toBeUndefined();
    expect(research.prompt).toContain(question);
    expect(generate.mock.calls[2][2].messages).toBeUndefined();
    expect(JSON.stringify(generate.mock.calls[2][2])).toContain(question);
    expect(JSON.stringify(generate.mock.calls[2][2])).toContain("INTENT ONLY");
    expect(JSON.stringify(generate.mock.calls[3][2])).toContain(question);
    expect(JSON.stringify(research)).not.toMatch(/ZXPRIVATE123|Luma|And the second time/);
    expect(await f.t.run(async ctx => (await ctx.db.get(f.sessionId))?.calls)).toBe(4);
  });
  it("never starts research when the private preparation fails", async () => {
    const f = await setup();
    const generate = vi.spyOn(Agent.prototype, "generateText").mockResolvedValue({ text: plan("Search record 12345"), finishReason: "stop" } as never);
    const result = await f.owner.action(api.conversation.reply, { sessionId: f.sessionId, text: "Explain induction", history: [] });
    expect(result.text).toContain("without sharing private details");
    expect(generate).toHaveBeenCalledTimes(1);
  });
  it("reserves each step and stops before search when preparation uses the last call", async () => {
    const f = await setup();
    await f.t.run(ctx => ctx.db.patch(f.sessionId, { calls: 19 }));
    const generate = vi.spyOn(Agent.prototype, "generateText").mockResolvedValue({ text: plan("What does labour induction mean?"), finishReason: "stop" } as never);
    const result = await f.owner.action(api.conversation.reply, { sessionId: f.sessionId, text: "Explain induction", history: [] });
    expect(result.text).toContain("Busy right now");
    expect(generate).toHaveBeenCalledTimes(1);
    expect(await f.t.run(async ctx => (await ctx.db.get(f.sessionId))?.calls)).toBe(20);
  });
  it("does not search or recreate content when the session ends during preparation", async () => {
    const f = await setup();
    const generate = vi.spyOn(Agent.prototype, "generateText").mockImplementationOnce(async () => {
      await f.owner.mutation(api.sessions.finish, { sessionId: f.sessionId });
      return { text: plan("What does labour induction mean?"), finishReason: "stop" } as never;
    });
    await f.owner.action(api.conversation.reply, { sessionId: f.sessionId, text: "Explain induction", history: [] });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(await f.t.run(ctx => ctx.db.get(f.sessionId))).toBeNull();
  });
});
