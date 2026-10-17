import { convexTest } from "convex-test";
import { Agent } from "@convex-dev/agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeFunctionReference } from "convex/server";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { personalResultReply } from "../convex/evidence";
import { urgentMessage } from "../convex/urgent";
const modules = import.meta.glob("../convex/**/*.{ts,js}");
afterEach(() => vi.restoreAllMocks());
describe("Reports retired from v1", () => {
  it("rejects an old-page upload before storing or processing anything", async () => {
    const t = convexTest(schema, modules);
    const generate = vi.spyOn(Agent.prototype, "generateText");
    const response = await t.fetch("/reports/upload", { method: "POST", headers: { Origin: "http://127.0.0.1:5173", "Content-Type": "application/pdf" }, body: "fictional old-page upload" });
    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({ error: "Report uploads are not available in v1." });
    expect(await t.run(ctx => ctx.db.system.query("_storage").take(1))).toEqual([]);
    expect(generate).not.toHaveBeenCalled();
    await expect(t.mutation(makeFunctionReference<"mutation">("reports:register"), {})).rejects.toThrow();
  });
  it("rejects an old report-processing request without AI while urgent questions still win", async () => {
    const t = convexTest(schema, modules);
    const generate = vi.spyOn(Agent.prototype, "generateText");
    expect((await t.action(api.conversation.reply, { text: "Check my uploaded report", urgentCheckOnly: true, history: [] })).text).toBe("Report uploads are not available in v1.");
    expect((await t.action(api.conversation.reply, { text: "I have severe pain", urgentCheckOnly: true, history: [] })).text).toBe(urgentMessage);
    expect(generate).not.toHaveBeenCalled();
  });
  it("removes legacy files, report rows and cached text in bounded batches", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(ctx => ctx.db.insert("users", {}));
    const owner = t.withIdentity({ subject: `${userId}|synthetic` });
    const sessionId = await owner.mutation(api.sessions.begin, {});
    for (let i = 0; i < 26; i++) {
      const storageId = await t.run(ctx => ctx.storage.store(new Blob(["fictional test file"], { type: "application/pdf" })));
      await t.run(ctx => ctx.db.insert("reports", { userId, sessionId, storageId, mimeType: "application/pdf", name: "fictional.pdf", extractedText: "Fictional cached text", extractionVersion: 1 }));
    }
    const first = await t.mutation(internal.reports.deleteDummyBatch, { confirmation: "DELETE_DUMMY_REPORTS" });
    expect(first).toEqual({ removedRows: 25, removedFiles: 25, remaining: true });
    expect(await t.mutation(internal.reports.deleteDummyBatch, { confirmation: "DELETE_DUMMY_REPORTS" })).toEqual({ removedRows: 1, removedFiles: 1, remaining: false });
    expect(await t.query(internal.reports.retiredInventory, {})).toMatchObject({ reports: 0, files: 0 });
    expect(await t.run(ctx => ctx.db.get(sessionId))).not.toBeNull();
  });
  it("never sends a legacy report into the v1 question flow", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(ctx => ctx.db.insert("users", {}));
    const owner = t.withIdentity({ subject: `${userId}|synthetic` });
    const sessionId = await owner.mutation(api.sessions.begin, {});
    const storageId = await t.run(ctx => ctx.storage.store(new Blob(["fictional retired report"], { type: "application/pdf" })));
    await t.run(ctx => ctx.db.insert("reports", { userId, sessionId, storageId, name: "fictional.pdf", mimeType: "application/pdf", extractedText: "Severe pain", extractionVersion: 1 }));
    const generate = vi.spyOn(Agent.prototype, "generateText");
    const result = await owner.action(api.conversation.reply, { sessionId, text: "Are my test results normal?", history: [] });
    expect(result.text).toBe(personalResultReply);
    expect(generate).not.toHaveBeenCalled();
  });
});
