import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import fs from "node:fs";

// Read only the development URL; never read provider credentials.
const env = fs.readFileSync(".env.local", "utf8");
const url = env.match(/^\s*CONVEX_URL=(.+)$/m)?.[1]?.trim();
if (!url) throw new Error("Development Convex URL is missing.");
const guest = new ConvexHttpClient(url);
const auth = await guest.action(api.auth.signIn, { provider: "anonymous" });
if (!auth.tokens?.token) throw new Error("Test guest could not start.");
guest.setAuth(auth.tokens.token);
let sessionId;
try {
  sessionId = await guest.mutation(api.sessions.begin, {});
  const question = 'My doctor wrote "Follow-up in two weeks; bring your previous reports." Can you explain the wording and suggest questions I can ask?';
  console.log("QUESTION:", question);
  const reply = await guest.action(api.conversation.reply, { sessionId, text: question, history: [] });
  console.log("RAW REPLY:");
  console.log(JSON.stringify(reply, null, 2));
  if (reply.text === "Busy right now. Try again in a few minutes.")
    throw new Error("The development AI test returned the busy message.");
} finally {
  if (sessionId) await guest.mutation(api.sessions.finish, { sessionId });
  await guest.action(api.auth.signOut, {});
}
