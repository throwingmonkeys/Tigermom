// Bounded checks with fictional questions, on the preview deployment only.
import fs from "node:fs";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
if (!/^CONVEX_DEPLOYMENT=dev:animated-shepherd-226\b/m.test(fs.readFileSync(".env.local", "utf8"))) throw Error("Preview guard failed");
const client = new ConvexHttpClient("https://animated-shepherd-226.ap-southeast-2.convex.cloud", { logger: false });
const auth = await client.action(api.auth.signIn, { provider: "anonymous" });
client.setAuth(auth.tokens.token);
const sessionId = await client.mutation(api.sessions.begin, {});
const records = [];
const feedbackMode = process.argv[2] === "feedback";
if (process.argv[2] && !feedbackMode) throw Error("Unknown check selection");
const output = feedbackMode ? "feedback-variant-attribution-final.json" : "private-search-live-final.json";
let history = feedbackMode ? JSON.parse(fs.readFileSync("private-search-live-final.json", "utf8")).slice(0, 2).flatMap(record => [{ role: "user", text: record.question }, { role: "assistant", text: record.reply.text }]) : [];
try {
  const cases = feedbackMode ? [
    { id: "criticism", text: "You don't know how long child birth takes? You had told me two days ago!", answer: true },
    { id: "feedback-repair", text: "Why could you not just answer how long labour takes? You said it yesterday.", answer: true },
  ] : [
    { id: "duration", text: "How long does childbirth take?", answer: true },
    { id: "followup", text: "And the second time?", answer: true },
    { id: "criticism", text: "You do not know how long child birth takes? You had told me two days ago!", answer: true },
  ];
  for (const test of cases) {
    await client.mutation(api.sessions.heartbeat, { sessionId });
    const prepared = { status: "not_inspected_live", note: "CLI could not invoke the internal action; integration tests inspect the outgoing research request." };
    const reply = await client.action(api.conversation.reply, { sessionId, text: test.text, history });
    records.push({ id: test.id, question: test.text, prepared, reply });
    fs.writeFileSync(output, JSON.stringify(records, null, 2) + "\n");
    console.log(JSON.stringify(records.at(-1)));
    if (reply && test.answer) {
      if (!reply.sources.length || /couldn.t give you a clear|Busy right now/.test(reply.text)) throw Error("Answer was withheld or failed");
      history = [...history, { role: "user", text: test.text }, { role: "assistant", text: reply.text }];
    }
  }
} finally {
  await client.mutation(api.sessions.finish, { sessionId });
  await client.action(api.auth.signOut, {});
  console.log("Fictional session ended and signed out.");
}
