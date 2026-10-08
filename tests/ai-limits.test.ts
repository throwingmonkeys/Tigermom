import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { describe, it, expect, vi, afterEach } from "vitest";
import schema from "../convex/schema";
import { internal, api } from "../convex/_generated/api";
import { Agent } from "@convex-dev/agent";

const modules = import.meta.glob("../convex/**/*.{ts,js}");
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("AI budget", () => {
  it("allows only 100 shared reservations across the app", async () => {
    const t = convexTest(schema, modules);
    rateLimiter.register(t);
    for (let n = 0; n < 100; n++)
      expect(await t.mutation(internal.aiLimits.reserve, {})).toBe(true);
    expect(await t.mutation(internal.aiLimits.reserve, {})).toBe(false);
  });
  it("does not reset the rolling cap at a fixed-window boundary", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    rateLimiter.register(t);
    await t.run(ctx => ctx.db.insert("aiBudget", {
      key: "global", calls: Array(100).fill(Date.now() - 30 * 60_000),
    }));
    expect(await t.mutation(internal.aiLimits.reserve, {})).toBe(false);
    vi.setSystemTime(Date.now() + 31 * 60_000);
    expect(await t.mutation(internal.aiLimits.reserve, {})).toBe(true);
  });
  it("returns the exact busy message on provider failure and releases the session", async () => {
    vi.stubEnv("OPENAI_API_KEY", "synthetic-test-placeholder");
    vi.stubEnv("AI_ENABLED", "true");
    const generate = vi.spyOn(Agent.prototype, "generateText")
      .mockRejectedValue(new Error("synthetic provider failure"));
    const t = convexTest(schema, modules);
    rateLimiter.register(t);
    const userId = await t.run(ctx => ctx.db.insert("users", {}));
    const owner = t.withIdentity({ subject: `${userId}|session` });
    const sessionId = await owner.mutation(api.sessions.begin, {});
    const reply = await owner.action(api.conversation.reply, {
      sessionId, text: "What questions can I ask about this note?", history: [],
    });
    expect(reply).toEqual({ text: "Busy right now. Try again in a few minutes.", sources: [] });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0][1]).toEqual({ userId: sessionId });
    expect(generate.mock.calls[0][2]).toMatchObject({ maxOutputTokens: 500, maxRetries: 0 });
    expect(await t.run(async ctx => (await ctx.db.get(sessionId))?.inFlight)).toBe(false);
  });
});
