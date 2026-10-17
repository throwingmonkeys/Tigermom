import {spawn} from "node:child_process";
import fs from "node:fs";
const child = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--remote-debugging-pipe", "--user-data-dir=C:/Users/sonja/Tigermom/.urgent-browser"], {stdio:["ignore","ignore","ignore","pipe","pipe"]});
const pending = new Map(); let sequence=0, buffer="";
child.stdio[4].on("data", chunk => {
  buffer += chunk.toString();
  let end;
  while ((end=buffer.indexOf("\0")) >=0) {
    const value=JSON.parse(buffer.slice(0,end)); buffer=buffer.slice(end+1);
    if (pending.has(value.id)) { pending.get(value.id)(value); pending.delete(value.id); }
  }
});
const send = (method,params={},sessionId) => new Promise((resolve,reject) => {
  const id=++sequence;
  const timer=setTimeout(()=>{pending.delete(id);reject(Error(`Browser timeout: ${method}`));},20000);
  pending.set(id, result=>{clearTimeout(timer);result.error?reject(Error(result.error.message)):resolve(result.result);});
  child.stdio[3].write(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})})+"\0");
});
const output=[];
const emit=v=>{output.push(JSON.stringify(v));console.log(JSON.stringify(v));};
let session;
try {
  const target=await send("Target.createTarget",{url:"about:blank"});
  session=(await send("Target.attachToTarget",{targetId:target.targetId,flatten:true})).sessionId;
  await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true},session);
  await send("Page.enable",{},session);
  const evaluate=async expression=>(await send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true},session)).result.value;
  await send("Page.navigate",{url:"https://animated-shepherd-226.ap-southeast-2.convex.site"},session);
  async function waitFor(expression) { for(let i=0;i<150;i++) {if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,200));}throw Error(`Not ready: ${expression}`); }
  async function capture(name) { const shot=await send("Page.captureScreenshot",{format:"png"},session);fs.writeFileSync(name,Buffer.from(shot.data,"base64")); }
  await waitFor("!!document.querySelector('.composer textarea')");
  const home=await evaluate("({questions:document.querySelectorAll('textarea').length,microphones:document.querySelectorAll('.mic-button').length,conversationAreas:document.querySelectorAll('.conversation-column').length,warning:!!document.querySelector('.urgent-notice')})");
  emit({check:"single phone conversation and no permanent warning",...home,status:home.questions===1&&home.microphones===1&&home.conversationAreas===1&&!home.warning?"pass":"fail"});
  await capture("conversation-dev-phone-home.png");
  await evaluate("document.querySelector('textarea[aria-label=\"Your question\"]').focus()");
  await send("Input.insertText",{text:"My waters broke"},session);
  await evaluate("document.querySelector('.send-button').click()");
  await waitFor("!!document.querySelector('.urgent-message')");
  const fixed=await evaluate("({text:document.querySelector('.urgent-message .message-body').innerText,previous:document.querySelector('.urgent-message').previousElementSibling.innerText,topBanner:!!document.querySelector('.urgent-notice'),questions:document.querySelectorAll('textarea').length})");
  emit({check:"urgent reply directly after question",...fixed,status:fixed.previous.includes('My waters broke')&&!fixed.topBanner&&fixed.questions===1?"pass":"fail"});
  await capture("conversation-dev-phone-urgent.png");
  await evaluate("document.querySelector('textarea').focus()");
  await send("Input.insertText",{text:"What does the word antenatal mean? Explain the word only."},session);
  await evaluate("document.querySelector('.send-button').click()");
  await waitFor("!!document.querySelector('.session-timer') && !!document.querySelector('.message.assistant') && !document.querySelector('.thinking')");
  emit({check:"first typed question quietly starts session",answer:await evaluate("document.querySelector('.message.assistant .message-body').innerText"),questions:await evaluate("document.querySelectorAll('textarea').length"),microphones:await evaluate("document.querySelectorAll('.mic-button').length"),status:"pass"});
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='End conversation').click()");
  await waitFor("document.body.innerText.includes('Skip feedback')");
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Skip feedback').click()");
  await waitFor("!!document.querySelector('.panel-home')");
  emit({check:"skip feedback returns home without Sources",status:await evaluate("!document.querySelector('.source-list') && document.querySelectorAll('textarea').length===1")?"pass":"fail"});
  await send("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false},session);
  await capture("conversation-dev-desktop-home.png");
  const desktop=await evaluate("({questions:document.querySelectorAll('textarea').length,microphones:document.querySelectorAll('.mic-button').length,overflow:document.documentElement.scrollWidth>innerWidth})");
  emit({check:"single desktop input without horizontal overflow",...desktop,status:desktop.questions===1&&desktop.microphones===1&&!desktop.overflow?"pass":"fail"});
} finally {
  await send("Browser.close").catch(()=>{});
  child.kill();
  fs.writeFileSync("urgent-browser-2026-10-10.log",output.join("\n")+"\n");
}
