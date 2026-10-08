import { query } from "./_generated/server";
import { v } from "convex/values";
export const availability = query({
  args: {},
  returns: v.object({ sms: v.boolean(), ai: v.boolean() }),
  handler: async () => ({
    sms: false,
    ai: Boolean(process.env.OPENAI_API_KEY) && process.env.AI_ENABLED !== "false",
  }),
});
