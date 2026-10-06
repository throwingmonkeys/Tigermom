import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import fs from "node:fs";
const env = fs.readFileSync(".env.local", "utf8");
const url = env.match(/^\s*CONVEX_URL=(.+)$/m)?.[1]?.trim();
const site = env.match(/^\s*CONVEX_SITE_URL=(.+)$/m)?.[1]?.trim();
if (!url || !site) throw new Error("Convex URLs are missing.");
const client = new ConvexHttpClient(url);
const availability = await client.query(api.settings.availability, {});
console.log("Cloud settings query passed:", availability);
let rejected = false;
try {
  await client.mutation(api.sessions.begin, {});
} catch {
  rejected = true;
}
if (!rejected) throw new Error("Unsigned conversation was allowed.");
console.log("Unsigned conversation rejected.");
const upload = await fetch(`${site}/reports/upload`, {
  method: "POST",
  headers: {
    Origin: "http://127.0.0.1:5173",
    "Content-Type": "application/pdf",
  },
  body: "%PDF-1.4 synthetic test",
});
if (upload.status !== 401)
  throw new Error(
    `Unsigned report upload returned ${upload.status}, expected 401.`,
  );
console.log("Unsigned report upload rejected with HTTP 401.");
const keys = await fetch(`${site}/.well-known/jwks.json`);
if (!keys.ok || !(await keys.json()).keys?.length)
  throw new Error("Public signing keys are unavailable.");
console.log("Public auth keys served correctly.");

const guest = new ConvexHttpClient(url);
const result = await guest.action(api.auth.signIn, { provider: "anonymous" });
if (!result.tokens?.token)
  throw new Error("Guest sign-in did not return a session.");
guest.setAuth(result.tokens.token);
let sessionId;
try {
  sessionId = await guest.mutation(api.sessions.begin, {});
  console.log("Guest conversation started without a phone number or code.");
  const uploaded = await fetch(`${site}/reports/upload`, {
    method: "POST",
    headers: {
      Origin: "http://127.0.0.1:5173",
      Authorization: `Bearer ${result.tokens.token}`,
      "Content-Type": "application/pdf",
      "X-Session-Id": sessionId,
      "X-Report-Name": "synthetic-test.pdf",
    },
    body: "%PDF-1.4\nSynthetic test fixture; no medical information.\n%%EOF",
  });
  if (!uploaded.ok)
    throw new Error(
      `Guest report upload failed with status ${uploaded.status}.`,
    );
  const { id: reportId } = await uploaded.json();
  console.log("Synthetic report uploaded inside the guest's private session.");
  let blocked = false;
  try {
    await client.mutation(api.reports.remove, { reportId });
  } catch {
    blocked = true;
  }
  if (!blocked)
    throw new Error("An unsigned client could delete a guest report.");
  await guest.mutation(api.sessions.finish, { sessionId });
  console.log("Guest conversation ended and its report cleanup completed.");
  sessionId = undefined;
} finally {
  if (sessionId) await guest.mutation(api.sessions.finish, { sessionId });
  await guest.action(api.auth.signOut, {});
  console.log("Guest signed out; no credentials printed.");
}
