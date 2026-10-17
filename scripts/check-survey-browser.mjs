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
let session;
const results=[];
try {
  const target=await send("Target.createTarget",{url:"about:blank"});
  session=(await send("Target.attachToTarget",{targetId:target.targetId,flatten:true})).sessionId;
  await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true},session);
  await send("Page.enable",{},session);
  const evaluate=async expression=>{ const r=await send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true},session); if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };
  async function waitFor(expression) { for(let i=0;i<150;i++) {if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,200));}throw Error(`Not ready: ${expression}`); }
  await send("Page.navigate",{url:"https://animated-shepherd-226.ap-southeast-2.convex.site"},session);
  await waitFor("!!document.querySelector('textarea')");
  await evaluate("document.querySelector('textarea').focus()");
  await send("Input.insertText",{text:"Hello"},session);
  await waitFor("!document.querySelector('.send-button').disabled");
  await evaluate("document.querySelector('.send-button').click()");
  await waitFor("!!document.querySelector('.session-timer') && !document.querySelector('.thinking')");
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Stop conversation').click()");
  await waitFor("document.body.innerText.includes('Was this conversation useful?')");
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Not quite').click();const s=document.querySelector('#reason');s.value='Something felt wrong';s.dispatchEvent(new Event('change',{bubbles:true}));");
  await waitFor("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Submit'&&!b.disabled)");
  const shot=await send("Page.captureScreenshot",{format:"png"},session);fs.writeFileSync("survey-submit-phone.png",Buffer.from(shot.data,"base64"));
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Submit').click()");
  await waitFor("!!document.querySelector('.panel-home') && !document.body.innerText.includes('Was this conversation useful?')");
  results.push({check:"Phone survey submits selected rating and automatically returns home",pass:true});
  console.log(JSON.stringify(results));
} catch(error) { console.log(await send("Runtime.evaluate",{expression:"document.body.innerText",returnByValue:true},session)); throw error; } finally {
  await send("Browser.close").catch(()=>{});child.kill();
  fs.writeFileSync("survey-browser-results.json",JSON.stringify(results,null,2));
}
