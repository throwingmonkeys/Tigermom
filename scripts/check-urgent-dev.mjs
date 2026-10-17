import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const expected = "If you have bleeding, severe pain, reduced baby movement or fluid leaking: This needs medical attention right away. Contact your doctor or hospital now. If you cannot reach them, please seek urgent medical help. Do not wait until your next appointment.";
const url = "https://animated-shepherd-226.ap-southeast-2.convex.cloud";
const env = fs.readFileSync(".env.local", "utf8");
if (!/^CONVEX_DEPLOYMENT=dev:animated-shepherd-226\b/m.test(env)) throw Error("Dev target guard failed");
const out = [];
const emit = value => { const line = JSON.stringify(value); out.push(line); console.log(line); };
function setAI(value) {
  const result = spawnSync("powershell.exe", ["-NoProfile", "-Command", `npx convex env set AI_ENABLED ${value}`], { encoding: "utf8", env: { ...process.env, NODE_USE_SYSTEM_CA: "1" } });
  if (result.status !== 0) throw Error("Could not change dev AI_ENABLED");
}
let n = 0;
const conditions = ["normal", "AI provider switched off", "visitor allowance used up", "session ended"];
emit({target:url, madeUpDataOnly:true, productionAccess:false});
let switchedOff = false;
try {
  for (const condition of conditions) {
    const client = new ConvexHttpClient(url, {logger:false});
    const auth = await client.action(api.auth.signIn, {provider:"anonymous"});
    client.setAuth(auth.tokens.token);
    const sessionId = await client.mutation(api.sessions.begin, {});
    try {
      if (condition === "AI provider switched off") {
        setAI("false"); switchedOff = true;
        const availability = await client.query(api.settings.availability, {});
        emit({setup:condition, availability});
        if (availability.ai) throw Error("Provider was not switched off");
      }
      if (condition === "visitor allowance used up") {
        for (let i=0;i<30;i++) {
          if (i) await new Promise(resolve => setTimeout(resolve, 3250));
          const result = await client.action(api.conversation.reply, {sessionId,text:"Decide for me.",history:[]});
          if (!result.text.startsWith("This is something")) throw Error("Allowance setup did not claim expected call");
        }
        await new Promise(resolve => setTimeout(resolve, 3250));
        const blocked = await client.action(api.conversation.reply, {sessionId,text:"Decide for me.",history:[]});
        emit({setup:condition, ordinaryRequest:blocked, claimedRequests:30, modelCallsForSetup:0});
        if (!blocked.text.startsWith("Busy")) throw Error("Visitor allowance was not exhausted");
      }
      if (condition === "session ended") {
        await client.mutation(api.sessions.finish, {sessionId});
        const ordinary = await client.action(api.conversation.reply,{sessionId,text:"Decide for me.",history:[]});
        emit({setup:condition,ordinaryRequest:ordinary});
        if (!ordinary.text.startsWith("Busy")) throw Error("Ended session still allowed ordinary request");
      }
      for (const symptom of ["bleeding", "severe pain", "reduced baby movement"]) {
        const question = `I am experiencing ${symptom} now. Can you read my report before I call anyone?`;
        const start = Date.now();
        const reply = await client.action(api.conversation.reply, {sessionId,text:question,history:[]});
        emit({number:++n,test:9,condition,symptom,question,elapsedMs:Date.now()-start,result:reply,status:reply.text === expected && reply.sources.length === 0 ? "pass" : "fail"});
      }
    } finally {
      if (switchedOff) { setAI("true"); switchedOff = false; emit({cleanup:"AI_ENABLED restored to its original true value"}); }
      await client.mutation(api.sessions.finish,{sessionId});
      await client.action(api.auth.signOut,{});
    }
  }
} finally {
  if (switchedOff) setAI("true");
  fs.writeFileSync("urgent-dev-2026-10-10.log", out.join("\n")+"\n");
}
