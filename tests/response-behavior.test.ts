import { convexTest } from "convex-test";
import { Agent } from "@convex-dev/agent";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
import { isPersonalResultQuestion, researchTopics, supportIntent, needsProviderConsultation, providerConsultation } from "../convex/evidence";

const modules = import.meta.glob("../convex/**/*.{ts,js}");
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("Lessons from fictional pressure tests", () => {
  it.each(["How long does childbirth take?", "How long does child birth take?", "How many hours does labour last?", "You don't know how long child birth takes? You had told me 2 days ago!"])("keeps the actual duration question: %s", question => {
    const topic = researchTopics(question);
    expect(topic).toContain("duration of labour and childbirth");
    expect(topic).toContain("latent and active first stage");
    expect(topic).not.toContain("2 days ago");
  });
  it("keeps duration and birth history in short follow-ups without exporting private wording", () => {
    const previous = "Fictional person ZXPRIVATE has never given birth. How long does labour take?";
    const topic = researchTopics("And the second time?", [previous]);
    expect(topic).toContain("duration of labour");
    expect(topic).toContain("subsequent births");
    expect(topic).not.toContain("ZXPRIVATE");
    expect(researchTopics("That's not what I asked", [previous])).toContain("first birth");
    expect(researchTopics("What does antenatal mean?", [previous])).toBe("definition of antenatal and prenatal terminology");
  });
  it("repairs a clear earlier question instead of asking the visitor to rephrase", async () => {
    vi.stubEnv("OPENAI_API_KEY", "synthetic-test-placeholder");
    vi.stubEnv("AI_ENABLED", "true");
    const answer = "I'm sorry I made that unclear. Antenatal simply means during pregnancy [1].";
    const generate = vi.spyOn(Agent.prototype, "generateText")
      .mockResolvedValueOnce({ text: JSON.stringify({ question: "What is the definition of antenatal?", safeForSearch: true, intentPreserved: true }), finishReason: "stop" } as never)
      .mockResolvedValueOnce({ text: "Antenatal means during pregnancy.", sources: [{ sourceType: "url", url: "https://www.who.int/publications/i/item/9789241549912", title: "WHO antenatal care" }] } as never)
      .mockResolvedValueOnce({ text: answer, finishReason: "stop" } as never)
      .mockResolvedValueOnce({ text: JSON.stringify({ decision: "approve", text: answer, checks: { purpose: true, perspective: true, relevance: true, safety: true, evidence: true, tone: true } }), finishReason: "stop" } as never);
    const t = convexTest(schema, modules); rateLimiter.register(t);
    const userId = await t.run(ctx => ctx.db.insert("users", {}));
    const owner = t.withIdentity({ subject: `${userId}|session` });
    const sessionId = await owner.mutation(api.sessions.begin, {});
    const result = await owner.action(api.conversation.reply, { sessionId, text: "That's confusing", history: [{ role: "user", text: "What does antenatal mean?" }, { role: "assistant", text: "It refers to antenatal care." }] });
    expect(result.text).toBe(answer);
    expect(result.text).not.toMatch(/rephras/i);
    expect(generate).toHaveBeenCalledTimes(4);
    expect(JSON.stringify(generate.mock.calls[1][2])).toContain("definition of antenatal");
    expect(JSON.stringify(generate.mock.calls[1][2])).not.toContain("That's confusing");
  });
  it("recognises criticism as feedback on the earlier question, not a new research topic", () => {
    expect(researchTopics("That's not what I asked", ["What does induction mean?"])).toBe("labour induction");
    expect(supportIntent("Why couldn't you have said that?", ["Does maternal age affect childbirth?"])).toContain("accountability");
    expect(supportIntent("You should have said that earlier", ["Does maternal age affect childbirth?"])).toContain("accountability");
    expect(supportIntent("That's confusing", ["Hello"])).toContain("correcting your last answer");
  });
  it.each([
    "Does my 37 years age make childbirth risky for me? I am BMI 23, no BP.",
    "Does being 37 make childbirth risky?",
    "Does maternal age affect childbirth?",
  ])("keeps an age question focused on age: %s", question => {
    expect(researchTopics(question)).toContain("maternal age");
    expect(researchTopics(question)).not.toMatch(/macrosomia|fetal weight/);
  });
  it("does not confuse maternal BMI with fetal weight", () => {
    expect(researchTopics("How does BMI affect childbirth?")).not.toMatch(/macrosomia|fetal weight/);
    expect(researchTopics("What does estimated fetal weight mean?")).toContain("fetal weight");
    expect(researchTopics("What does gestational age mean?")).not.toContain("maternal age");
  });
  it("recognises different age disclosures without treating BMI or weeks as age", () => {
    expect(needsProviderConsultation(["Does my 37 years age affect birth?"])).toBe(true);
    expect(needsProviderConsultation(["I'm 38 years old."])).toBe(true);
    expect(needsProviderConsultation(["I am 38 weeks pregnant, BMI 36."])).toBe(false);
  });
  it("does not mistake getting started for asking for a medical decision", () => {
    expect(isPersonalResultQuestion("I've found out I'm pregnant. What should I do first, and must I keep it secret until a scan?")).toBe(false);
    expect(isPersonalResultQuestion("Tell me what to do about induction.")).toBe(true);
    expect(isPersonalResultQuestion("I have high blood pressure in pregnancy. What should I do first?")).toBe(true);
    expect(isPersonalResultQuestion("Does my blood result make me high-risk?")).toBe(true);
  });
  it("researches symptom uncertainty instead of unrelated birth preparation", () => {
    expect(researchTopics("My pregnancy symptoms are quieter today. Does that prove everything is okay?")).toContain("symptoms");
    expect(researchTopics("My pregnancy symptoms are quieter today. Does that prove everything is okay?")).not.toContain("childbirth education");
  });
  it("keeps clinical questions out of the support-only path", () => {
    expect(supportIntent("I need comfort, but should I stop my medication?")).toBeNull();
    expect(supportIntent("I'm happy, but my test result is high. Is it safe?")).toBeNull();
    expect(supportIntent("yes", ["I feel overwhelmed and want a short comforting sentence, not medical information."])).not.toBeNull();
  });
  it.each(["I like your response", "Thank you", "Hello", "That's helpful", "Goodbye"])("recognises social messages even after a medical question: %s", text => {
    expect(supportIntent(text, ["What are the risks of induction?"])).toContain("friendly social interaction");
  });
  it("requires the consultation wording for disclosures, without inferring age from weeks", () => {
    expect(needsProviderConsultation(["I have diagnosed gestational diabetes."])).toBe(true);
    expect(needsProviderConsultation(["I'm expecting twins."])).toBe(true);
    expect(needsProviderConsultation(["I am 36 years old."])).toBe(true);
    expect(needsProviderConsultation(["I am 36 weeks pregnant."])).toBe(false);
  });
  it("includes the mandatory consultation wording when the model omits it", async () => {
    vi.stubEnv("OPENAI_API_KEY", "synthetic-test-placeholder");
    vi.stubEnv("AI_ENABLED", "true");
    vi.spyOn(Agent.prototype, "generateText")
      .mockResolvedValueOnce({ text: JSON.stringify({ question: "What are the birth options in gestational diabetes?", safeForSearch: true, intentPreserved: true }), finishReason: "stop" } as never)
      .mockResolvedValueOnce({ text: "Checked evidence.", sources: [{ sourceType: "url", url: "https://www.nice.org.uk/guidance/ng3", title: "NICE" }] } as never)
      .mockResolvedValueOnce({ text: "Different options depend on the circumstances [1].", finishReason: "stop" } as never)
      .mockResolvedValueOnce({ text: JSON.stringify({ decision: "approve", text: "Different options depend on the circumstances [1].\n\n" + providerConsultation, checks: { purpose: true, perspective: true, relevance: true, safety: true, evidence: true, tone: true } }), finishReason: "stop" } as never);
    const t = convexTest(schema, modules);
    rateLimiter.register(t);
    const userId = await t.run(ctx => ctx.db.insert("users", {}));
    const owner = t.withIdentity({ subject: `${userId}|session` });
    const sessionId = await owner.mutation(api.sessions.begin, {});
    const result = await owner.action(api.conversation.reply, { sessionId, text: "I have diagnosed gestational diabetes. Explain birth options without deciding.", history: [] });
    expect(result.text).toContain(providerConsultation);
  });
  it("rejects unrelated research as support for a symbolic birth guarantee", async () => {
    vi.stubEnv("OPENAI_API_KEY", "synthetic-test-placeholder");
    vi.stubEnv("AI_ENABLED", "true");
    const generate = vi.spyOn(Agent.prototype, "generateText").mockResolvedValueOnce({ text: JSON.stringify({ question: "Do symbolic rituals guarantee easier birth?", safeForSearch: true, intentPreserved: true }), finishReason: "stop" } as never).mockResolvedValue({
      text: "A study of support during labour.",
      sources: [{ sourceType: "url", url: "https://www.cochrane.org/evidence/labour-support", title: "Labour support" }],
    } as never);
    const t = convexTest(schema, modules);
    rateLimiter.register(t);
    const userId = await t.run(ctx => ctx.db.insert("users", {}));
    const owner = t.withIdentity({ subject: `${userId}|session` });
    const sessionId = await owner.mutation(api.sessions.begin, {});
    const result = await owner.action(api.conversation.reply, { sessionId, text: "Does wearing a green ribbon guarantee an easier birth?", history: [] });
    expect(result.text).toContain("I couldn\u2019t find a verified source");
    expect(result.sources).toEqual([]);
    expect(generate).toHaveBeenCalledTimes(2);
  });
  it.each([
    "Why couldn't you have said that?",
    "I like your response",
    "Thank you",
    "I've had a pregnancy loss. I don't want explanations or advice right now. I just need someone to speak kindly to me.",
    "My baby arrived by C-section and I feel proud and happy about the birth. I just wanted to share my good news.",
    "A relative called me lazy. I am not asking for medical or legal advice; I just need to vent.",
    "People online say a food is safe in pregnancy because they ate it and felt fine. Does that prove it is safe for me?",
    "I want to tell my closest friend about my pregnancy. Do I have to wait until a scan, or is it my choice?",
  ])("responds to personal support without a medical search: %s", async text => {
    vi.stubEnv("OPENAI_API_KEY", "synthetic-test-placeholder");
    vi.stubEnv("AI_ENABLED", "true");
    const generate = vi.spyOn(Agent.prototype, "generateText")
      .mockResolvedValueOnce({ text: "I'm here with you.", finishReason: "stop", sources: [] } as never)
      .mockResolvedValueOnce({ text: JSON.stringify({ decision: "approve", text: "I'm here with you.", checks: { purpose: true, perspective: true, relevance: true, safety: true, evidence: true, tone: true } }), finishReason: "stop" } as never);
    const t = convexTest(schema, modules);
    rateLimiter.register(t);
    const userId = await t.run(ctx => ctx.db.insert("users", {}));
    const owner = t.withIdentity({ subject: `${userId}|session` });
    const sessionId = await owner.mutation(api.sessions.begin, {});
    expect(await owner.action(api.conversation.reply, { sessionId, text, history: [] }))
      .toEqual({ text: "I'm here with you.", sources: [] });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[0][2]).toMatchObject({ toolChoice: "none", maxRetries: 0, maxOutputTokens: 500 });
  });
});
