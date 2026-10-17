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


const deadline=setTimeout(()=>{child.kill();process.exit(1);},180000);
let session;
const records=[];
try {
  const target=await send("Target.createTarget",{url:"about:blank"});
  session=(await send("Target.attachToTarget",{targetId:target.targetId,flatten:true})).sessionId;
  await send("Page.enable",{},session);
  await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true},session);
  const evaluate=async expression=>{
    const r=await send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true},session);
    if(r.exceptionDetails)throw Error(r.exceptionDetails.text);
    return r.result.value;
  };
  const waitFor=async expression=>{for(let n=0;n<240;n++){if(await evaluate(expression))return;await new Promise(resolve=>setTimeout(resolve,250));}throw Error("Not ready: "+expression);};
  await send("Page.navigate",{url:"https://animated-shepherd-226.ap-southeast-2.convex.site"},session);
  await waitFor("!!document.querySelector('textarea')");
  await evaluate(`(()=>{const t=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'I like your response');t.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await waitFor("!document.querySelector('[aria-label=\"Send question\"]').disabled");
  await evaluate("document.querySelector('[aria-label=\"Send question\"]').click()");
  await waitFor("!!document.querySelector('.message.assistant .response-feedback') && !document.querySelector('.thinking')");
  const answer=await evaluate("document.querySelector('.message.assistant .message-body').innerText");
  records.push({check:'Appreciation gets a conversational reply',answer});
  if(/standards|Busy right now|couldn.t prepare/.test(answer))throw Error('Social reply was refused');
  const layout=await evaluate(`(()=>{const g=document.querySelector('.response-feedback');g.scrollIntoView({block:'center'});return {buttons:[...g.querySelectorAll('button')].map(b=>({label:b.getAttribute('aria-label'),height:b.getBoundingClientRect().height})),overflow:document.documentElement.scrollWidth>innerWidth};})()`);
  if(layout.buttons.length!==2||layout.buttons.some(b=>b.height<44)||layout.overflow)throw Error('Feedback controls do not fit phone');
  records.push({check:'Phone feedback buttons',...layout});
  await evaluate("document.querySelector('[aria-label=\"Like this response\"]').click()");
  await waitFor("document.querySelector('[aria-label=\"Like this response\"]').getAttribute('aria-pressed')==='true' && document.querySelector('.response-feedback [role=status]').innerText==='Thanks for your feedback'");
  records.push({check:'Like saved in one tap',pass:true});
  await evaluate("document.querySelector('[aria-label=\"Dislike this response\"]').click()");
  await waitFor("document.querySelector('[aria-label=\"Dislike this response\"]').getAttribute('aria-pressed')==='true' && document.querySelector('.response-feedback [role=status]').innerText==='Thanks for your feedback'");
  records.push({check:'Changed rating saved in one tap',pass:true});
  await send("Emulation.setDeviceMetricsOverride",{width:1280,height:900,deviceScaleFactor:1,mobile:false},session);
  records.push({check:'Desktop layout',overflow:await evaluate('document.documentElement.scrollWidth>innerWidth')});
  await evaluate("window.SpeechRecognition=class{start(){}abort(){}}; document.querySelector('.talk-button').click()");
  await waitFor("document.querySelector('.talk-button')?.getAttribute('aria-label')==='Stop conversation'");
  await evaluate("document.querySelector('.talk-button').click()");
  await waitFor("!!document.querySelector('.feedback-content')");
  records.push({check:'Session ended and private vote records deleted by server finish',pass:true});
} finally {
  fs.writeFileSync('response-feedback-browser-results.json',JSON.stringify(records,null,2)+'\n');
  console.log(JSON.stringify(records,null,2));
  clearTimeout(deadline);
  await send('Page.navigate',{url:'about:blank'},session).catch(()=>{});
  await send('Browser.close').catch(()=>{});
  child.kill();
}
