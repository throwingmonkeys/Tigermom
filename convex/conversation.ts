"use node";
import { action } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { internal, components } from "./_generated/api";
import { Agent } from "@convex-dev/agent";
import { convexGateway } from "@convex-dev/ai-sdk-provider";
import { openai } from "@ai-sdk/openai";
import { stepCountIs, type ModelMessage, type UserContent } from "ai";
import { instructions, trustedSource } from "./evidence";

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
    await ctx.runMutation(internal.sessions.claim, {
      sessionId: args.sessionId,
    });
    try {
      if (process.env.AI_ENABLED !== "true")
        throw new ConvexError("AI conversations are not configured");
      const guide = new Agent(components.agent, {
        name: "Tigermom",
        languageModel: convexGateway.responses(
          process.env.AI_MODEL ?? "openai/gpt-5",
        ),
        instructions,
        storageOptions: { saveMessages: "none" },
        tools: {
          web_search: openai.tools.webSearch({
            filters: {
              allowedDomains: [
                "fogsi.org",
                "acog.org",
                "who.int",
                "mohfw.gov.in",
                "nhm.gov.in",
                "icmr.gov.in",
                "pmc.ncbi.nlm.nih.gov",
                "pubmed.ncbi.nlm.nih.gov",
                "lamaze.org",
                "inamay.com",
                "ijrcog.org",
                "reuters.com",
                "apnews.com",
                "bbc.com",
                "thehindu.com",
                "indianexpress.com",
              ],
            },
            userLocation: {
              country: "IN",
              city: "Bengaluru",
              type: "approximate",
            },
          }),
        },
        stopWhen: stepCountIs(4),
      });
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
      const result = await guide.generateText(
        ctx,
        {},
        {
          messages: history,
          prompt: [{ role: "user", content }],
          maxOutputTokens: 1800,
          maxRetries: 0,
          abortSignal: AbortSignal.timeout(90_000),
          providerOptions: { openai: { store: false } },
        },
        {
          storageOptions: { saveMessages: "none" },
          contextOptions: { recentMessages: 0 },
        },
      );
      // Sources come from the search provider, never URLs invented in the prose.
      const sources = result.sources.flatMap((s) =>
        s.sourceType === "url" && trustedSource(s.url)
          ? [{ title: s.title || new URL(s.url).hostname, url: s.url }]
          : [],
      );
      const unique = Array.from(
        new Map(sources.map((s) => [s.url, s])).values(),
      ).slice(0, 6);
      // An answer without retrieved evidence must not silently become medical advice.
      if (!unique.length)
        return {
          text: "I’m here with you. I couldn’t verify a reliable source for that answer just now, and I don’t want to guess. Your care provider can help clarify it. What would you most like to ask them? If you’re describing symptoms that may be urgent, contact your care provider now; for a possible emergency, seek urgent medical help immediately.",
          sources: [],
        };
      const current = await ctx.runQuery(internal.sessions.files, {
        sessionId: args.sessionId,
      });
      // The ownership check above also makes an ended session reject late replies.
      void current;
      return { text: result.text, sources: unique };
    } finally {
      await ctx.runMutation(internal.sessions.release, {
        sessionId: args.sessionId,
      });
    }
  },
});
