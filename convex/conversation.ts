"use node";
import { action } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { internal, components } from "./_generated/api";
import { Agent } from "@convex-dev/agent";
import { openai } from "@ai-sdk/openai";
import { type ModelMessage, type UserContent } from "ai";
import { instructions } from "./evidence";

export const reply = action({
  args: {
    sessionId: v.id("sessions"),
    text: v.string(),
    history: v.array(
      v.object({
        role: v.union(v.literal("user"), v.literal("assistant")),
        text: v.string(),
      }),
    ),
  },
  returns: v.object({
    text: v.string(),
    sources: v.array(v.object({ title: v.string(), url: v.string() })),
  }),
  handler: async (ctx, args) => {
    if (
      args.text.length > 3000 ||
      !args.text.trim() ||
      args.history.length > 12 ||
      args.history.some((m) => m.text.length > 12000)
    )
      throw new ConvexError("Please keep your question shorter.");
    let claimed = false;
    let stage = "session";
    try {
      await ctx.runMutation(internal.sessions.claim, { sessionId: args.sessionId });
      claimed = true;
      stage = "configuration";
      if (!process.env.OPENAI_API_KEY || process.env.AI_ENABLED === "false")
        throw new ConvexError("AI conversations are not configured");
      const guide = new Agent(components.agent, {
        name: "Tigermom",
        languageModel: openai.responses("gpt-4.1-mini"),
        instructions,
        storageOptions: { saveMessages: "none" },
      });
      stage = "reports";
      const files = await ctx.runQuery(internal.sessions.files, {
        sessionId: args.sessionId,
      });
      const content: UserContent = [{ type: "text", text: args.text }];
      for (const file of files) {
        const blob = await ctx.storage.get(file.storageId);
        if (!blob) continue;
        const bytes = new Uint8Array(await blob.arrayBuffer());
        if (file.mimeType.startsWith("image/"))
          content.push({
            type: "image",
            image: bytes,
            mediaType: file.mimeType,
          });
        else
          content.push({
            type: "file",
            data: bytes,
            mediaType: file.mimeType,
            filename: file.name,
          });
      }
      const history: ModelMessage[] = args.history.map((m) => ({
        role: m.role,
        content: m.text,
      }));
      const allowed = await ctx.runMutation(internal.aiLimits.reserve, {});
      if (!allowed) return { text: "Busy right now. Try again in a few minutes.", sources: [] };
      stage = "provider";
      const result = await guide.generateText(
        ctx,
        // Use the private session as an isolated scope; no history is stored.
        { userId: args.sessionId },
        {
          messages: history,
          prompt: [{ role: "user", content }],
          maxOutputTokens: 500,
          maxRetries: 0,
          abortSignal: AbortSignal.timeout(90_000),
          providerOptions: { openai: { store: false } },
        },
        {
          storageOptions: { saveMessages: "none" },
          contextOptions: { recentMessages: 0 },
        },
      );
      if (!result.text.trim()) throw new Error("Empty reply");
      const current = await ctx.runQuery(internal.sessions.files, {
        sessionId: args.sessionId,
      });
      // The ownership check above also makes an ended session reject late replies.
      void current;
      return { text: result.text, sources: [] };
    } catch (error) {
      // Log only an error category and HTTP status, never the error object,
      // request headers, provider key, prompt, or uploaded report.
      const status = error && typeof error === "object" && "statusCode" in error
        && typeof error.statusCode === "number" ? error.statusCode : null;
      console.warn("AI reply failed", stage, error instanceof Error ? error.name : "Unknown", status);
      return { text: "Busy right now. Try again in a few minutes.", sources: [] };
    } finally {
      if (claimed) await ctx.runMutation(internal.sessions.release, {
        sessionId: args.sessionId,
      });
    }
  },
});
