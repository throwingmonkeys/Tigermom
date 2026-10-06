import {
  mutation,
  internalMutation,
  internalQuery,
  httpAction,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v, ConvexError } from "convex/values";
import { ownedSession } from "./sessions";
export const prepare = internalQuery({
  args: { sessionId: v.id("sessions") },
  returns: v.null(),
  handler: async (ctx, { sessionId }) => {
    await ownedSession(ctx, sessionId);
    const previous = await ctx.db
      .query("reports")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .take(3);
    if (previous.length >= 3) throw new ConvexError("Report limit reached.");
    return null;
  },
});
export const register = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    storageId: v.id("_storage"),
    name: v.string(),
    mimeType: v.string(),
  },
  returns: v.id("reports"),
  handler: async (ctx, args) => {
    const session = await ownedSession(ctx, args.sessionId);
    const previous = await ctx.db
      .query("reports")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .take(3);
    const meta = await ctx.db.system.get(args.storageId);
    if (
      !meta ||
      meta.size > 10 * 1024 * 1024 ||
      !["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(
        meta.contentType ?? "",
      ) ||
      meta.contentType !== args.mimeType ||
      previous.length >= 3 ||
      args.name.length > 200
    ) {
      throw new ConvexError(
        "Use up to three written reports, each no larger than 10 MB.",
      );
    }
    return ctx.db.insert("reports", { ...args, userId: session.userId });
  },
});
function allowedOrigin(request: Request) {
  const origin = request.headers.get("Origin");
  const site = process.env.CONVEX_SITE_URL;
  const frontend = process.env.SITE_URL;
  return origin &&
    [site, frontend, "http://127.0.0.1:5173", "http://localhost:5173"].includes(
      origin,
    )
    ? origin
    : null;
}
export const options = httpAction(async (_ctx, request) => {
  const origin = allowedOrigin(request);
  if (!origin) return new Response(null, { status: 403 });
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Authorization, Content-Type, X-Session-Id, X-Report-Name",
      Vary: "Origin",
    },
  });
});
export const upload = httpAction(async (ctx, request) => {
  const origin = allowedOrigin(request);
  if (!origin) return new Response(null, { status: 403 });
  const headers = {
    "Access-Control-Allow-Origin": origin,
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
  const respond = (value: object, status = 200) =>
    new Response(JSON.stringify(value), { status, headers });
  if (!(await getAuthUserId(ctx)))
    return respond({ error: "Verify your phone first." }, 401);
  const sessionId = request.headers.get("X-Session-Id") as Id<"sessions">;
  const name = decodeURIComponent(
    request.headers.get("X-Report-Name") ?? "Report",
  );
  const mimeType = request.headers.get("Content-Type") ?? "";
  if (
    !sessionId ||
    name.length > 200 ||
    !["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(
      mimeType,
    )
  )
    return respond({ error: "Choose a written report PDF or photo." }, 400);
  let storageId: Id<"_storage"> | undefined;
  try {
    await ctx.runQuery(internal.reports.prepare, { sessionId });
    const blob = await request.blob();
    if (!blob.size || blob.size > 10 * 1024 * 1024)
      return respond({ error: "Reports must be no larger than 10 MB." }, 400);
    const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
    const pdf =
      bytes[0] === 37 &&
      bytes[1] === 80 &&
      bytes[2] === 68 &&
      bytes[3] === 70 &&
      bytes[4] === 45;
    const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const png =
      bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
    const webp =
      new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
      new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
    if (!(
      (mimeType === "application/pdf" && pdf) ||
      (mimeType === "image/jpeg" && jpg) ||
      (mimeType === "image/png" && png) ||
      (mimeType === "image/webp" && webp)
    ))
      return respond(
        {
          error:
            "The file does not match its type. Choose a PDF or report photo.",
        },
        400,
      );
    storageId = await ctx.storage.store(blob);
    const id = await ctx.runMutation(internal.reports.register, {
      sessionId,
      storageId,
      name,
      mimeType,
    });
    return respond({ id });
  } catch {
    if (storageId) await ctx.storage.delete(storageId);
    return respond(
      { error: "Upload could not finish. Check your session and try again." },
      400,
    );
  }
});
export const remove = mutation({
  args: { reportId: v.id("reports") },
  returns: v.null(),
  handler: async (ctx, { reportId }) => {
    const report = await ctx.db.get(reportId);
    const userId = await getAuthUserId(ctx);
    if (!report) return null;
    if (!userId || report.userId !== userId)
      throw new ConvexError("This report belongs to someone else.");
    await ctx.storage.delete(report.storageId);
    await ctx.db.delete(reportId);
    return null;
  },
});
