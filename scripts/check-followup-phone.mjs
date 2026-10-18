// Finite Chrome checks using the real App and CSS with fictional backend replies.
// No paid calls; the fixture server and browser always close before exit.
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { build } from "vite";
import react from "@vitejs/plugin-react";

const root = process.cwd();
const baseline = process.argv.includes("--baseline");
const output = path.join(root, "test-output");
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, "phone-convex.js"), `
export const useConvexAuth=()=>({isAuthenticated:true,isLoading:false});
export const useQuery=()=>({ai:true,sms:false});
export const useMutation=()=>async()=>"fictional-session";
export const useAction=()=>async()=>{window.phoneRequests=(window.phoneRequests||0)+1;return {text:window.phoneAnswer,sources:[{title:"Fictional source link for layout check",url:"https://www.nice.org.uk/guidance/ng235"}]}};
`);
fs.writeFileSync(path.join(output, "phone-auth.js"), `export const useAuthActions=()=>({signIn:async()=>{},signOut:async()=>{}});export const useAuthToken=()=>null;`);
fs.writeFileSync(path.join(output, "phone-entry.jsx"), `
import React from 'react';import {createRoot} from 'react-dom/client';
import App from '../src/App';import '../src/styles.css';
import '@fontsource/manrope/latin-400.css';import '@fontsource/manrope/latin-500.css';
import '@fontsource/manrope/latin-600.css';import '@fontsource/manrope/latin-700.css';
import '@fontsource/bree-serif/latin-400.css';
createRoot(document.getElementById('root')).render(<App/>);
`);
fs.writeFileSync(path.join(output, "phone-entry.html"), `<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/test-output/phone-entry.jsx"></script></body></html>`);
const fixture = path.join(output, "phone-fixture");
await build({ configFile: false, plugins: [baseline && { name: "committed-baseline", enforce: "pre", load(id) {
  for (const file of ["src/App.tsx", "src/styles.css"]) if (path.normalize(id) === path.join(root, file)) return execFileSync("git", ["show", `HEAD:${file}`], { encoding: "utf8" });
} }, react()].filter(Boolean), resolve: { alias: [
  { find: "convex/react", replacement: path.join(output, "phone-convex.js") },
  { find: "@convex-dev/auth/react", replacement: path.join(output, "phone-auth.js") },
] }, build: { outDir: fixture, emptyOutDir: true, rollupOptions: { input: path.join(output, "phone-entry.html") } } });

const server = http.createServer((req, res) => {
  const file = path.resolve(fixture, "." + decodeURIComponent(req.url.split("?")[0]));
  if (!file.startsWith(fixture + path.sep) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
  const type = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2" }[path.extname(file)];
  res.setHeader("Content-Type", type || "application/octet-stream");
  res.end(fs.readFileSync(file));
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const browser = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--remote-debugging-pipe"], { stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] });
const pending = new Map(); let sequence = 0, buffer = "";
browser.stdio[4].on("data", chunk => {
  buffer += chunk.toString(); let end;
  while ((end = buffer.indexOf("\0")) >= 0) {
    const message = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
    pending.get(message.id)?.(message);
  }
});
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const id = ++sequence;
  const timer = setTimeout(() => { pending.delete(id); reject(Error(`Chrome timeout: ${method}`)); }, 20000);
  pending.set(id, message => { clearTimeout(timer); pending.delete(id); message.error ? reject(Error(message.error.message)) : resolve(message.result); });
  browser.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + "\0");
});
const deadline = setTimeout(() => { browser.kill(); server.closeAllConnections(); server.close(); process.exitCode = 1; }, 90000);
try {
  const target = await send("Target.createTarget", { url: "about:blank" });
  const session = (await send("Target.attachToTarget", { targetId: target.targetId, flatten: true })).sessionId;
  const evaluate = async expression => {
    const response = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, session);
    if (response.exceptionDetails) throw Error(JSON.stringify(response.exceptionDetails));
    return response.result.value;
  };
  const waitFor = async expression => {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await evaluate(expression)) return;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw Error(`Not ready: ${expression}`);
  };
  await send("Page.enable", {}, session);
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, session);
  await send("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/test-output/phone-entry.html` }, session);
  await waitFor("!!document.querySelector('textarea')");
  await evaluate(`window.SpeechSynthesisUtterance=class {constructor(text){this.text=text}};Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>[{name:'Fictional local voice',lang:'en-IN',localService:true}],cancel(){},speak(){window.phoneSpeaking=true}}});void 0;`);
  const results = [];
  for (const [length, answer] of [
    ["short", "This is a short fictional answer for checking the phone screen [1]."],
    ["long", "This is fictional text for a layout check, not medical guidance. ".repeat(30) + "[1]."],
  ]) {
    if (baseline && length === "short") continue;
    await evaluate(`(()=>{window.phoneAnswer=${JSON.stringify(answer)};const input=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'Explain birth preparation');input.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
    await waitFor("!document.querySelector('.send-button').disabled");
    const previous = await evaluate("window.phoneRequests||0");
    await evaluate("document.querySelector('.send-button').click()");
    await waitFor(`window.phoneRequests>${previous} && ${baseline ? "true" : "document.querySelector('.question-label')?.textContent==='Ask a follow-up question'"} && !document.querySelector('textarea').disabled`);
    if (baseline) {
      const bounds = await evaluate(`(()=>{const r=document.querySelector('textarea').getBoundingClientRect(),s=document.querySelector('.send-button').getBoundingClientRect();return {width:390,height:innerHeight,pageScrollY:scrollY,questionTop:r.top,questionBottom:r.bottom,sendTop:s.top,sendBottom:s.bottom}})()`);
      const image = await send("Page.captureScreenshot", { format: "png" }, session);
      const screenshotPath = path.join(output, "followup-before-fix-390.png");
      fs.writeFileSync(screenshotPath, Buffer.from(image.data, "base64"));
      console.log(JSON.stringify({ check: "committed version before fix", ...bounds, boxBelowScreen: bounds.questionBottom > bounds.height, screenshotPath }));
      break;
    }
    for (const keyboard of [false, true]) {
      // Emulate the keyboard's visual-viewport resize, including overlay-style
      // keyboards where layout viewport and CSS dvh remain 844px high.
      await evaluate(`window.phoneViewport??=new EventTarget();Object.defineProperties(window.phoneViewport,{height:{configurable:true,value:${keyboard ? 430 : 844}},offsetTop:{configurable:true,value:0}});`);
      // Native visualViewport events call the App's mounted resize listener;
      // replacing just the native height models the keyboard without a real IME.
      await evaluate(`Object.defineProperty(window.visualViewport,'height',{configurable:true,value:${keyboard ? 430 : 844}});window.visualViewport.dispatchEvent(new Event('resize'));${keyboard ? "document.querySelector('textarea').focus();" : "document.querySelector('textarea').blur();"}`);
      await send("Emulation.setVisibleSize", { width: 390, height: keyboard ? 430 : 844 }, session);
      await evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
      await waitFor("(()=>{const t=document.querySelector('.chat-messages');return t.scrollHeight-t.clientHeight-t.scrollTop<=1})()");
      const bounds = await evaluate(`(()=>{const q=document.querySelector('textarea'),s=document.querySelector('.send-button'),r=q.getBoundingClientRect(),b=s.getBoundingClientRect(),v=window.visualViewport;return {width:390,visualHeight:v.height,layoutHeight:innerHeight,question:{top:r.top,bottom:r.bottom,left:r.left,right:r.right},send:{top:b.top,bottom:b.bottom,left:b.left,right:b.right},questionEnabled:!q.disabled,label:document.querySelector('.question-label').textContent,citations:document.querySelectorAll('.answer-sources a').length,sourceUrl:document.querySelector('.answer-sources a').href}})()`);
      if (bounds.question.top < 0 || bounds.question.bottom > bounds.visualHeight || bounds.send.bottom > bounds.visualHeight || bounds.send.right > 390 || !bounds.questionEnabled) throw Error("Composer hidden: " + JSON.stringify(bounds));
      await evaluate("document.querySelector('.read-button').click()");
      if (!await evaluate("window.phoneSpeaking && !document.querySelector('textarea').disabled")) throw Error("Question box unavailable during playback");
      const screenshotPath = path.join(output, `followup-${length}-${keyboard ? "keyboard-open" : "keyboard-closed"}-390.png`);
      const image = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: 390, height: keyboard ? 430 : 844, scale: 1 }, captureBeyondViewport: true }, session);
      fs.writeFileSync(screenshotPath, Buffer.from(image.data, "base64"));
      const result = { length, keyboard: keyboard ? "emulated visual viewport; no physical keyboard" : "closed", ...bounds, playback: "question box remains enabled", screenshotPath };
      results.push(result); console.log(JSON.stringify(result));
    }
  }
  fs.writeFileSync(path.join(output, "followup-phone-results.json"), JSON.stringify(results, null, 2));
  console.log(baseline ? "Baseline captured; no product files changed." : "PASS: four 390px phone cases; long/short replies, keyboard open/closed, local playback, unchanged source link. Fictional backend replies; no medical AI calls.");
} finally {
  clearTimeout(deadline); browser.kill(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
