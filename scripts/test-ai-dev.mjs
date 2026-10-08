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
  const question = process.argv[2] ?? 'What is the difference between induction and augmentation of labour? Explain briefly using ACOG or FOGSI, and give me one question for my doctor.';
  console.log("QUESTION:", question);
  const reply = await guest.action(api.conversation.reply, { sessionId, text: question, history: [] });
  console.log("RAW REPLY:");
  console.log(JSON.stringify(reply, null, 2));
  if (reply.text === "Busy right now. Try again in a few minutes.")
    throw new Error("The development AI test returned the busy message.");
  if (process.argv.includes("--boundary")) {
    if (!reply.text.includes("I can’t judge your personal result")) throw new Error("Personal result boundary was not enforced.");
  } else if (!reply.sources.length) throw new Error("The development AI test returned no checked sources.");
  if (reply.text.split(/\s+/).length > 90) throw new Error("The development reply was too long.");
} finally {
  if (sessionId) await guest.mutation(api.sessions.finish, { sessionId });
  await guest.action(api.auth.signOut, {});
}
