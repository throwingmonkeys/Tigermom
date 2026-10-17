// Finite preview check with made-up questions; no uploads or private data.
import fs from "node:fs";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
if (!/^CONVEX_DEPLOYMENT=dev:animated-shepherd-226\b/m.test(fs.readFileSync(".env.local", "utf8"))) throw Error("Preview guard failed");
const client = new ConvexHttpClient("https://animated-shepherd-226.ap-southeast-2.convex.cloud", { logger: false });
const auth = await client.action(api.auth.signIn, { provider: "anonymous" });
client.setAuth(auth.tokens.token);
const sessionId = await client.mutation(api.sessions.begin, {});
const records = [], history = [];
try {
  for (const text of ["How long does childbirth take?", "And the second time?"]) {
    const reply = await client.action(api.conversation.reply, { sessionId, text, history });
    records.push({ question: text, reply });
    fs.writeFileSync("report-free-live-answers.json", JSON.stringify(records, null, 2) + "\n");
    console.log(JSON.stringify(records.at(-1)));
    if (!reply?.sources?.length || /couldn.t give you a clear|Busy right now|couldn.t find a verified/i.test(reply.text)) throw Error("Normal answer unavailable");
    history.push({ role: "user", text }, { role: "assistant", text: reply.text });
  }
} finally {
  await client.mutation(api.sessions.finish, { sessionId });
  await client.action(api.auth.signOut, {});
  console.log("Made-up session ended and signed out.");
}
