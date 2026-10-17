import {spawn} from "node:child_process";
import fs from "node:fs";
const child = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--remote-debugging-pipe"], {stdio:["ignore","ignore","ignore","pipe","pipe"]});
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

const deadline=setTimeout(()=>{child.kill();process.exit(1);},60000);
const emit=value=>console.log(JSON.stringify(value));
let session;
try {
  const target=await send("Target.createTarget",{url:"about:blank"});
  session=(await send("Target.attachToTarget",{targetId:target.targetId,flatten:true})).sessionId;
  await send("Page.enable",{},session);
  await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true},session);
  const evaluate=async expression=>(await send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true},session)).result.value;
  const waitFor=async expression=>{for(let n=0;n<100;n++){if(await evaluate(expression))return;await new Promise(resolve=>setTimeout(resolve,150));}throw Error("Not ready: "+expression);};
  await send("Page.navigate",{url:"https://animated-shepherd-226.ap-southeast-2.convex.site"},session);
  await waitFor("!!document.querySelector('.talk-button')");
  const primary=await evaluate("(()=>{const button=document.querySelector('.talk-button'),s=getComputedStyle(button),r=button.getBoundingClientRect(),area=document.querySelector('.composer-area');return {label:button.innerText,width:r.width,height:r.height,background:s.backgroundColor,opacity:s.opacity,fullWidth:r.width>=area.clientWidth-30}})()");
  emit({check:"full-size primary Talk button",...primary});
  if(primary.height<48||primary.background!=="rgb(84, 48, 71)"||primary.opacity!=="1"||!primary.fullWidth)throw Error("Primary Talk button is faded or undersized");
  const security=await evaluate("({secure:window.isSecureContext,microphoneApiAvailable:!!(window.SpeechRecognition||window.webkitSpeechRecognition)})");
  emit({check:"HTTPS phone preview",...security});
  if(!security.secure||!security.microphoneApiAvailable)throw Error("Secure microphone API unavailable");
  await evaluate("window.SpeechRecognition=class{start(){window.previewMicStarted=true}abort(){window.previewMicStopped=true}}; document.querySelector('.talk-button').click()");
  await waitFor("document.querySelector('.talk-button')?.getAttribute('aria-label')==='Stop conversation' && window.previewMicStarted");
  const check=await evaluate("(()=>{const b=document.querySelector('.talk-button').getBoundingClientRect(),t=document.querySelector('textarea').getBoundingClientRect();return {label:document.querySelector('.talk-button').innerText,aboveText:b.bottom<=t.top,buttons:[...document.querySelectorAll('button')].filter(x=>x.textContent.includes('Stop conversation')).length,separateEndRow:!!document.querySelector('.end-row')}})()");
  emit({check:"single visible Talk/Stop toggle",...check});
  if(!check.aboveText||check.buttons!==1||check.separateEndRow)throw Error("Conversation toggle layout failed");
  for(const width of [320,390]){
    await send("Emulation.setDeviceMetricsOverride",{width,height:430,deviceScaleFactor:1,mobile:true},session);
    await evaluate("document.querySelector('textarea').focus();document.querySelector('.composer').scrollIntoView({block:'center'})");
    const layout=await evaluate("(()=>{const s=document.querySelector('.send-button').getBoundingClientRect(),t=document.querySelector('textarea').getBoundingClientRect();return {sendVisible:s.top>=0&&s.bottom<=innerHeight,sendAboveText:s.bottom<=t.top,overflow:document.documentElement.scrollWidth>innerWidth}})()");
    emit({check:"shortened phone keyboard viewport",width,...layout});
    if(!layout.sendVisible||!layout.sendAboveText||layout.overflow)throw Error("Phone composer failed");
  }
  await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true},session);
  const image=await send("Page.captureScreenshot",{format:"png"},session);
  fs.writeFileSync("phone-preview-toggle.png",Buffer.from(image.data,"base64"));
  await evaluate("document.querySelector('.talk-button').click()");
  await waitFor("document.body.innerText.includes('Was this conversation useful?') && window.previewMicStopped");
  emit({check:"Stop conversation stops microphone and opens feedback",status:"pass"});
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Yes, it helped').click()");
  await waitFor("!!document.querySelector('#reason')");
  await evaluate("const select=document.querySelector('#reason');select.value='I feel clearer';select.dispatchEvent(new Event('change',{bubbles:true}))");
  await waitFor("!document.querySelector('.feedback-content .primary-button').disabled");
  await evaluate("document.querySelector('.feedback-content .primary-button').click()");
  await waitFor("document.querySelector('.panel-home') && document.querySelector('.talk-button')?.getAttribute('aria-label')==='Talk to Tigermom'");
  const returned=await evaluate("({home:!!document.querySelector('.panel-home'),timer:!!document.querySelector('.session-timer'),label:document.querySelector('.talk-button').innerText})");
  emit({check:"Back to Home returns home without starting a session",...returned});
  if(!returned.home||returned.timer)throw Error("Survey unexpectedly started a session");
} finally {
  clearTimeout(deadline);
  await send("Browser.close").catch(()=>{});
  child.kill();
}
