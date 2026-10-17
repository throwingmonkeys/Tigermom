// Bounded inventory and explicitly authorised cleanup of dummy report storage.
import fs from "node:fs";
import { execFileSync } from "node:child_process";
if (!/^CONVEX_DEPLOYMENT=dev:animated-shepherd-226\b/m.test(fs.readFileSync(".env.local", "utf8"))) throw Error("Preview guard failed");
const mode = process.argv[2] ?? "inventory";
if (!["inventory", "delete-preview"].includes(mode)) throw Error("Unknown retirement operation");
const run = args => JSON.parse(execFileSync(process.execPath, ["node_modules/convex/bin/main.js", "run", ...args], {
  encoding: "utf8", timeout: 60000, env: { ...process.env, NODE_OPTIONS: "--use-system-ca" },
}));
const query = 'const reports=await ctx.db.query("reports").take(1001); const files=await ctx.db.system.query("_storage").take(1001); return {reports:reports.length,files:files.length,truncated:reports.length>1000||files.length>1000,types:Array.from(new Set(files.map(f=>f.contentType??"unknown")))};';
if (mode === "inventory") {
  const result = { preview: run(["--inline-query", query]), production: run(["--inline-query", query, "--prod"]) };
  fs.writeFileSync("report-retirement-inventory.json", JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result));
} else {
  let rows = 0, files = 0, completed = false;
  for (let batch = 0; batch < 100; batch++) {
    const result = run(["reports:deleteDummyBatch", JSON.stringify({ confirmation: "DELETE_DUMMY_REPORTS" })]);
    rows += result.removedRows; files += result.removedFiles;
    if (!result.remaining) { completed = true; break; }
  }
  const after = run(["reports:retiredInventory", "{}"]);
  const result = { environment: "preview", removedReportRows: rows, removedFiles: files, completed, after };
  fs.writeFileSync("report-retirement-deletion.json", JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result));
  if (!completed || after.reports || after.files) throw Error("Report cleanup is incomplete");
}
