import { describe, it, expect, vi, afterEach } from "vitest";
import { convexTest } from "convex-test";
import { Agent } from "@convex-dev/agent";
import rateLimiter from "@convex-dev/rate-limiter/test";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
import { acceptSearchQuestion, searchQuestionInstructions } from "../convex/searchQuestion";
const modules = import.meta.glob("../convex/**/*.{ts,js}");
const plan = (question: string) => JSON.stringify({ question, safeForSearch: true, intentPreserved: true });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
describe("Private contextual search preparation", () => {
  it("checks output safety even when the original needed no privacy edits", () => {
    expect(searchQuestionInstructions).toContain("nothing needed removing");
    expect(acceptSearchQuestion(JSON.stringify({ question: "What is labour?", safeForSearch: true, intentPreserved: true }))).toBe("What is labour?");
    expect(acceptSearchQuestion(JSON.stringify({ question: "What is labour?", safeForSearch: false, intentPreserved: true }))).toBeNull();
  });
  it("does not claim personal details were present when intent preparation failed", async () => {
    const f = await setup();
    const generate = vi.spyOn(Agent.prototype, "generateText").mockResolvedValue({ text: JSON.stringify({ question: "", safeForSearch: false, intentPreserved: false }), finishReason: "stop" } as never);
    const result = await f.owner.action(api.conversation.reply, { sessionId: f.sessionId, text: "What does the 20 week scan check?", history: [] });
    expect(result.text).toContain("Please try asking it another way");
    expect(result.text).not.toMatch(/private details|names|personal information/);
    expect(generate).toHaveBeenCalledTimes(1);
  });
  it.each([
    "What does the 20 week scan check?",
    "What does BMI 25 mean in general pregnancy guidance?",
    "How is pregnancy care different at age 35?",
    "What are Braxton Hicks contractions?",
    "What is a phone number used for in booking maternity care?",
    "What should a record of antenatal visits include?",
    "Why does a hospital ask for a patient ID number?",
    "What does the general BMI range 18.5 - 24.9 mean?",
    "What changed in the guidance dated 2026-10-18?",
  ])("does not mistake general educational wording for personal information: %s", question => {
    expect(acceptSearchQuestion(plan(question))).toBe(question);
  });
  it.each([
    "What should my name is Priya Sharma ask about birth?",
    "Call +91 98765 43210 about birth",
    "Email priya@example.test about birth",
    "What maternity care is near 42 Lotus Road?",
    "Search patient ID AB123456 about birth",
  ])("keeps actual identifiers out of search: %s", question => {
    expect(acceptSearchQuestion(plan(question))).toBeNull();
  });
  it.each(["not JSON", plan("Search patient record 12345"), plan("Email someone@example.test"), plan("Open https://example.test"), JSON.stringify({ question: "What is labour?", safeForSearch: false, intentPreserved: true })])("rejects unsafe or incomplete preparation: %s", raw => {
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
    expect(result.text).toBe("Your session has ended. You can start another session now.");
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
