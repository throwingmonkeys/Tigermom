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
  const storageId = await t.run((ctx) =>
    ctx.storage.store(
      new Blob(["%PDF-1.4 written report"], { type: "application/pdf" }),
    ),
  );
  // convex-test omits Blob contentType in _storage metadata. Seed a stored
  // report to test access and deletion without weakening production validation.
  const reportId = await t.run((ctx) =>
    ctx.db.insert("reports", {
      sessionId,
      storageId,
      userId,
      mimeType: "application/pdf",
      name: "report.pdf",
    }),
  );
  return { t, owner, other, userId, sessionId, reportId, storageId };
}
describe("Private free sessions", () => {
  it("deletes reports and their storage when the woman ends her session", async () => {
    const f = await fixture();
    await f.owner.mutation(api.sessions.finish, { sessionId: f.sessionId });
    expect(await f.t.run((ctx) => ctx.db.get(f.reportId))).toBeNull();
    expect(await f.t.run((ctx) => ctx.storage.get(f.storageId))).toBeNull();
    expect(await f.t.run((ctx) => ctx.db.get(f.sessionId))).toBeNull();
    await expect(
      f.owner.mutation(api.sessions.finish, { sessionId: f.sessionId }),
    ).resolves.toBeNull();
  });
  it("blocks another woman from accessing or deleting a report or session", async () => {
    const f = await fixture();
    await expect(
      f.other.query(internal.sessions.files, { sessionId: f.sessionId }),
    ).rejects.toThrow();
    await expect(
      f.other.mutation(api.reports.remove, { reportId: f.reportId }),
    ).rejects.toThrow();
    await expect(
      f.other.mutation(api.sessions.finish, { sessionId: f.sessionId }),
    ).rejects.toThrow();
    expect(
      await f.t.run(
        async (ctx) => (await ctx.storage.get(f.storageId)) !== null,
      ),
    ).toBe(true);
  });
  it("deletes expired uploads after an unexpectedly closed session", async () => {
    vi.useFakeTimers();
    const f = await fixture();
    await f.t.run((ctx) =>
      ctx.db.patch(f.sessionId, { expiresAt: Date.now() - 1 }),
    );
    await f.t.mutation(internal.sessions.expire, { sessionId: f.sessionId });
    expect(await f.t.run((ctx) => ctx.storage.get(f.storageId))).toBeNull();
    await f.t.finishAllScheduledFunctions(() => vi.runAllTimers());
  });
  it("rejects unsigned uploads and unsupported or oversized reports", async () => {
    const f = await fixture();
    await expect(f.t.mutation(api.sessions.begin, {})).rejects.toThrow();
    const invalid = await f.t.run((ctx) =>
      ctx.storage.store(new Blob(["bad"], { type: "text/html" })),
    );
    await expect(
      f.owner.mutation(internal.reports.register, {
        sessionId: f.sessionId,
        storageId: invalid,
        name: "bad.html",
        mimeType: "text/html",
      }),
    ).rejects.toThrow();
    const response = await f.t.fetch("/reports/upload", {
      method: "POST",
      headers: {
        Origin: "http://127.0.0.1:5173",
        "Content-Type": "application/pdf",
      },
      body: "%PDF-1.4",
    });
    expect(response.status).toBe(401);
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
