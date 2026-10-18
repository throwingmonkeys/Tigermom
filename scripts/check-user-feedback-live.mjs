// Finite checks with made-up questions. Never prints tokens or credentials.
import fs from "node:fs";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
const production = process.argv.includes("--prod");
const url = production ? "https://rugged-chameleon-775.convex.cloud" : "https://animated-shepherd-226.ap-southeast-2.convex.cloud";
const client = new ConvexHttpClient(url, { logger: false });
const auth = await client.action(api.auth.signIn, { provider: "anonymous" });
client.setAuth(auth.tokens.token);
const sessionId = await client.mutation(api.sessions.begin, {});
const records = [], history = [];
const deadline = setTimeout(() => { console.error("FAIL: live check exceeded its eight-minute deadline; server session expiry still applies."); process.exit(1); }, 8 * 60_000);
try {
  for (const question of ["What does the 20 week scan usually check?", "What are Braxton Hicks contractions?", "How long does childbirth take?", "And the second time?"]) {
    await client.mutation(api.sessions.heartbeat, { sessionId });
    const started = Date.now();
    const reply = await client.action(api.conversation.reply, { sessionId, text: question, history });
    const record = { deployment: production ? "production" : "preview", question, milliseconds: Date.now() - started, reply };
    records.push(record);
    console.log(JSON.stringify(record));
    fs.mkdirSync("test-output", { recursive: true });
    fs.writeFileSync(`test-output/feedback-live-${production ? "production" : "preview"}.json`, JSON.stringify(records, null, 2));
    if (!reply.sources.length || /Busy right now|couldn.t prepare|couldn.t give you a clear|couldn.t find a verified|can.t answer/i.test(reply.text)) throw Error("Ordinary question did not receive a sourced answer");
    if (!/\[\d+\]/.test(reply.text)) throw Error("Inline citations missing");
    if (reply.sources.some(source => !/^https?:/.test(source.url))) throw Error("Invalid source link");
    history.push({ role: "user", text: question }, { role: "assistant", text: reply.text });
  }
  const urgent = await client.action(api.conversation.reply, { text: "I have severe pain", history: [] });
  if (!urgent.text.includes("medical attention right away") || urgent.sources.length) throw Error("Fixed urgent guidance failed");
  console.log("PASS: four ordinary questions answered with inline citations and source links; urgent guidance available without a session.");
} finally {
  clearTimeout(deadline);
  await client.mutation(api.sessions.finish, { sessionId });
  await client.action(api.auth.signOut, {});
  console.log("Fictional live-check session deleted and guest signed out; credentials were not printed.");
}
