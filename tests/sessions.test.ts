import { convexTest } from "convex-test";
import { describe, expect, it, vi, afterEach } from "vitest";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { trustedSource } from "../convex/evidence";
const modules = import.meta.glob("../convex/**/*.{ts,js}");

afterEach(() => vi.useRealTimers());
async function fixture() {
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", { phone: "+919876543210" }),
  );
  const otherId = await t.run((ctx) =>
    ctx.db.insert("users", { phone: "+919876543211" }),
  );
  const owner = t.withIdentity({ subject: `${userId}|session` });
  const other = t.withIdentity({ subject: `${otherId}|session` });
  const sessionId = await owner.mutation(api.sessions.begin, {});
  return { t, owner, other, userId, sessionId };
}
describe("Private free sessions", () => {
  it("ends at ten minutes even when the page keeps checking in", async () => {
    vi.useFakeTimers();
    const f = await fixture();
    const started = Math.ceil(await f.t.run(async (ctx) => (await ctx.db.get(f.sessionId))!._creationTime));
    for (let minute = 1; minute < 10; minute++) {
      vi.setSystemTime(started + minute * 60_000);
      await f.owner.mutation(api.sessions.heartbeat, { sessionId: f.sessionId });
    }
    vi.setSystemTime(started + 10 * 60_000);
    await expect(f.owner.mutation(api.sessions.heartbeat, {
      sessionId: f.sessionId,
    })).rejects.toThrow("session has ended");
    await expect(f.owner.mutation(internal.sessions.claim, {
      sessionId: f.sessionId,
    })).rejects.toThrow("session has ended");
    await f.t.mutation(internal.sessions.expire, { sessionId: f.sessionId });
    expect(await f.t.run((ctx) => ctx.db.get(f.sessionId))).toBeNull();
    await f.t.finishAllScheduledFunctions(() => vi.runAllTimers());
  });
  it("clears a session when its owner ends it", async () => {
    const f = await fixture();
    await f.owner.mutation(api.sessions.finish, { sessionId: f.sessionId });
    expect(await f.t.run(ctx => ctx.db.get(f.sessionId))).toBeNull();
    await expect(f.owner.mutation(api.sessions.finish, { sessionId: f.sessionId })).resolves.toBeNull();
  });
  it("blocks another visitor from accessing or ending a session", async () => {
    const f = await fixture();
    await expect(f.other.query(internal.sessions.assertActive, { sessionId: f.sessionId })).rejects.toThrow();
    await expect(f.other.mutation(api.sessions.finish, { sessionId: f.sessionId })).rejects.toThrow();
    expect(await f.t.run(ctx => ctx.db.get(f.sessionId))).not.toBeNull();
  });
  it("clears an expired session", async () => {
    vi.useFakeTimers(); const f = await fixture();
    await f.t.run(ctx => ctx.db.patch(f.sessionId, { expiresAt: Date.now() - 1 }));
    await f.t.mutation(internal.sessions.expire, { sessionId: f.sessionId });
    expect(await f.t.run(ctx => ctx.db.get(f.sessionId))).toBeNull();
    await f.t.finishAllScheduledFunctions(() => vi.runAllTimers());
  });
  it("rejects an unsigned session start", async () => {
    const f = await fixture();
    await expect(f.t.mutation(api.sessions.begin, {})).rejects.toThrow();
  });
});
describe("Evidence links", () => {
  it("accepts reference domains and rejects lookalikes, credentials, and unsafe links", () => {
    expect(trustedSource("https://www.acog.org/womens-health")).toBe(true);
    expect(trustedSource("https://www.fogsi.org/")).toBe(true);
    for (const url of [
      "https://acog.org.attacker.com/",
      "javascript:alert(1)",
      "http://acog.org/",
      "https://user:pass@acog.org/",
      "not a URL",
    ])
      expect(trustedSource(url)).toBe(false);
  });
});
