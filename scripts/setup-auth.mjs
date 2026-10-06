import { generateKeyPair, exportPKCS8, exportJWK } from "jose";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const cli = fileURLToPath(
  new URL("../node_modules/convex/bin/main.js", import.meta.url),
);
function run(args) {
  // Windows command invocation has no shell interpolation of credential text.
  const result = spawnSync(process.execPath, [cli, ...args.slice(1)], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0)
    throw new Error(
      "Convex auth configuration failed. No credential values were printed.",
    );
  return result.stdout;
}
const list = run(["convex", "env", "list"]);
if (!list.includes("JWT_PRIVATE_KEY=") || !list.includes("JWKS=")) {
  const pair = await generateKeyPair("RS256", { extractable: true });
  const privateKey = (await exportPKCS8(pair.privateKey))
    .trimEnd()
    .replace(/\n/g, " ");
  const publicKey = await exportJWK(pair.publicKey);
  run(["convex", "env", "set", `JWT_PRIVATE_KEY=${privateKey}`]);
  run([
    "convex",
    "env",
    "set",
    `JWKS=${JSON.stringify({ keys: [{ use: "sig", ...publicKey }] })}`,
  ]);
  console.log("Auth signing keys configured in Convex. No keys saved to disk.");
} else console.log("Existing auth signing keys kept.");
run(["convex", "env", "set", "SITE_URL=http://127.0.0.1:5173"]);
console.log("Development sign-in URL configured.");
