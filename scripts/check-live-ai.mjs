import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../node_modules/convex/bin/main.js", import.meta.url));
const urls = spawnSync(process.execPath, [cli, "run", "--prod", "--component", "staticHosting", "lib:getUrls", "{}"], { encoding: "utf8", windowsHide: true });
if (urls.status !== 0) throw new Error("Could not read hosted site URLs.");
const { cloudUrl, siteUrl } = JSON.parse(urls.stdout);
const home = await fetch(siteUrl);
if (!home.ok || !(await home.text()).includes('<div id="root">'))
  throw new Error("The hosted homepage did not load.");
console.log("Hosted homepage loaded:", siteUrl);
const guest = new ConvexHttpClient(cloudUrl);
if (!(await guest.query(api.settings.availability, {})).ai)
  throw new Error("Production AI is unavailable.");
const auth = await guest.action(api.auth.signIn, { provider: "anonymous" });
if (!auth.tokens?.token) throw new Error("Live guest sign-in failed.");
guest.setAuth(auth.tokens.token);
let sessionId;
try {
  sessionId = await guest.mutation(api.sessions.begin, {});
  const reply = await guest.action(api.conversation.reply, {
    sessionId, text: 'What is the difference between induction and augmentation of labour? Explain briefly using ACOG or FOGSI, and give me one question for my doctor.', history: [],
  });
  if (!reply.text.trim() || reply.text === "Busy right now. Try again in a few minutes.")
    throw new Error("Live AI returned no usable reply.");
  if (!reply.sources.length || reply.text.split(/\s+/).length > 90)
    throw new Error("Live reply was missing checked sources or was too long.");
  console.log("Live guest session received a short AI reply with checked sources.");
} finally {
  if (sessionId) await guest.mutation(api.sessions.finish, { sessionId });
  await guest.action(api.auth.signOut, {});
}
console.log("Test conversation ended. Browser appearance and audio remain unchecked.");
