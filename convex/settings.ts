import { query } from "./_generated/server";
import { v } from "convex/values";
export const availability = query({
  args: {},
  returns: v.object({ sms: v.boolean(), ai: v.boolean() }),
  handler: async () => ({
    sms: Boolean(
      process.env.SMS_DELIVERY_URL && process.env.SMS_DELIVERY_SECRET,
    ),
    ai: Boolean(process.env.AI_ENABLED === "true"),
  }),
});
