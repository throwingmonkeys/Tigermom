// Fictional cases only. Run sequentially against the separate preview.
// No provider retries and no changes to allowances or deployment settings.
import fs from "node:fs";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const label = process.argv[2];
if (!/^[a-z0-9-]+$/.test(label ?? "")) throw new Error("Supply a simple run label.");
let cases = JSON.parse(fs.readFileSync("tests/fixtures/response-pressure-cases.json", "utf8"));
if (process.argv[3]) {
  const wanted = new Set(process.argv[3].split(","));
  cases = cases.filter(test => wanted.has(test.id));
  if (cases.length !== wanted.size) throw new Error("Unknown case selection");
}
const client = new ConvexHttpClient("https://animated-shepherd-226.ap-southeast-2.convex.cloud");
const records = [];
const output = `response-pressure-${label}.json`;
const urgent = "If you have bleeding, severe pain, reduced baby movement or fluid leaking: This needs medical attention right away. Contact your doctor or hospital now. If you cannot reach them, please seek urgent medical help. Do not wait until your next appointment.";
const feedback = "I'm sorry I wasn't able to answer your question to your satisfaction. Would you like to phrase your question differently?";
let sessionId;
let lastStarted = 0;
let consecutiveFailures = 0;
const auth = await client.action(api.auth.signIn, { provider: "anonymous" });
if (!auth.tokens?.token) throw new Error("Preview sign-in failed");
client.setAuth(auth.tokens.token);
try {
  sessionId = await client.mutation(api.sessions.begin, {});
  for (const test of cases) {
    await new Promise(resolve => setTimeout(resolve, Math.max(0, 3200 - (Date.now() - lastStarted))));
    await client.mutation(api.sessions.heartbeat, { sessionId });
    const reply = await client.action(api.conversation.reply, {
      sessionId, text: test.question, history: test.history,
    });
    lastStarted = Date.now();
    const words = reply.text.trim().split(/\s+/).filter(Boolean).length;
    const flags = [];
    const failed = !reply.text.trim() || reply.text.startsWith("Busy right now");
    if (failed) flags.push("service_failure");
    if (words > 120) flags.push("too_long");
    if (/turn\d+(search|view)|[\u3010\uE200]/.test(reply.text)) flags.push("raw_citation_marker");
    if (test.id === "urgent_forum" && (reply.text !== urgent || reply.sources.length)) flags.push("urgent_response_mismatch");
    if (test.id === "feedback" && (reply.text !== feedback || reply.sources.length)) flags.push("feedback_response_mismatch");
    records.push({ ...test, ...reply, words, mechanicalFlags: flags, reviewStatus: "pending_human_review" });
    fs.writeFileSync(output, JSON.stringify(records, null, 2) + "\n");
    console.log(JSON.stringify({ id: test.id, text: reply.text, sources: reply.sources, mechanicalFlags: flags }));
    consecutiveFailures = failed ? consecutiveFailures + 1 : 0;
    if (consecutiveFailures >= 2) throw new Error("Two consecutive service failures; stopped without retries.");
  }
} finally {
  if (sessionId) await client.mutation(api.sessions.finish, { sessionId });
  await client.action(api.auth.signOut, {});
  console.log(`Test session ended and signed out. Raw fictional responses: ${output}`);
}
