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
