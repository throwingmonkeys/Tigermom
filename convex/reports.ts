// Reports are outside v1. Keep a tombstone for old pages and private cleanup only.
import { internalMutation, internalQuery, httpAction } from "./_generated/server";
import { v, ConvexError } from "convex/values";
const reportTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
function originHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin");
  const allowed = [process.env.CONVEX_SITE_URL, process.env.SITE_URL, "http://127.0.0.1:5173", "http://localhost:5173"];
  return origin && allowed.includes(origin) ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {};
}
export const options = httpAction(async (_ctx, request) => new Response(null, { status: 204, headers: {
  ...originHeaders(request), "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Session-Id, X-Report-Name",
} }));
export const upload = httpAction(async (_ctx, request) => new Response(JSON.stringify({ error: "Report uploads are not available in v1." }), {
  status: 410, headers: { ...originHeaders(request), "Content-Type": "application/json", "Cache-Control": "no-store" },
}));
export const retiredInventory = internalQuery({
  args: {}, returns: v.object({ reports: v.number(), files: v.number(), truncated: v.boolean(), unexpectedTypes: v.array(v.string()) }),
  handler: async ctx => {
    const rows = await ctx.db.query("reports").take(1001);
    const files = await ctx.db.system.query("_storage").take(1001);
    return { reports: rows.length, files: files.length, truncated: rows.length > 1000 || files.length > 1000,
      unexpectedTypes: [...new Set(files.map(file => file.contentType ?? "unknown").filter(type => !reportTypes.has(type)))] };
  },
});
export const deleteDummyBatch = internalMutation({
  args: { confirmation: v.literal("DELETE_DUMMY_REPORTS") },
  returns: v.object({ removedRows: v.number(), removedFiles: v.number(), remaining: v.boolean() }),
  handler: async ctx => {
    // Root storage was used only for private reports. Static-hosting assets live
    // in the component's separate storage namespace and are never touched here.
    const rows = await ctx.db.query("reports").take(25);
    let removedFiles = 0;
    for (const row of rows) {
      if (await ctx.db.system.get(row.storageId)) { await ctx.storage.delete(row.storageId); removedFiles++; }
      await ctx.db.delete(row._id);
    }
    // Also remove report blobs left behind before registration completed.
    if (!rows.length) {
      const files = await ctx.db.system.query("_storage").take(25);
      if (files.some(file => !reportTypes.has(file.contentType ?? ""))) throw new ConvexError("Unexpected root storage type; no orphan files deleted.");
      for (const file of files) { await ctx.storage.delete(file._id); removedFiles++; }
    }
    const moreRows = await ctx.db.query("reports").take(1);
    const moreFiles = await ctx.db.system.query("_storage").take(1);
    return { removedRows: rows.length, removedFiles, remaining: moreRows.length > 0 || moreFiles.length > 0 };
  },
});
