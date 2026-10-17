import fs from "node:fs";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const guest = new ConvexHttpClient("https://animated-shepherd-226.ap-southeast-2.convex.cloud");
const records = [];
const history = [];
const auth = await guest.action(api.auth.signIn, { provider: "anonymous" });
if (!auth.tokens?.token) throw new Error("Preview sign-in failed");
guest.setAuth(auth.tokens.token);
let sessionId;
async function turn(label, question, context = history) {
  const answer = await guest.action(api.conversation.reply, { sessionId, text: question, history: context });
  records.push({ label, question, ...answer });
  console.log(JSON.stringify(records.at(-1), null, 2));
  if (!answer.text.trim() || answer.text.startsWith("Busy right now")) throw new Error("AI test returned a service failure");
  context.push({ role: "user", text: question }, { role: "assistant", text: answer.text });
  return answer;
}
const offersSimplification = text => /(?:i can|would you like|shall i|can explain|happy to)[\s\S]{0,160}(?:simpler|simply|simplify|plain language)/i.test(text);
try {
  sessionId = await guest.mutation(api.sessions.begin, {});
  const a = await turn("a", "is there a weight at which delivery becomes risky?");
  const contextAfterA = history.map(message => ({ ...message }));
  const b = await turn("b", "that's dumb");
  if (offersSimplification(b.text)) {
    await turn("c", "yes");
  } else if (offersSimplification(a.text)) {
    await turn("c (branch immediately after a's actual offer)", "yes", contextAfterA);
  } else {
    await turn("offer setup (neither a nor b offered simplification)", "Please offer to explain your answer about weight in simpler words using the sources you already have. Do not simplify it yet.");
    await turn("c", "yes");
  }
} finally {
  if (sessionId) await guest.mutation(api.sessions.finish, { sessionId });
  await guest.action(api.auth.signOut, {});
  fs.writeFileSync(`answer-focus-preview-results-${Date.now()}.json`, JSON.stringify(records, null, 2) + "\n");
  console.log("Test session ended and signed out. Raw responses saved to a timestamped answer-focus-preview-results file.");
}
