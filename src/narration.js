// Reads a narration aloud with the browser's speech engine. Sentences are queued one by one,
// because some engines stop long utterances part-way through.
let current=null;
export const canSpeak=()=>typeof speechSynthesis!=='undefined'&&typeof SpeechSynthesisUtterance!=='undefined';
function finish(token){if(current?.token!==token)return;const done=current.done;current=null;done?.();}
export function speak(text,done){
 stopSpeaking();
 const parts=String(text||'').split(/(?<=[。！？])/).map(x=>x.trim()).filter(Boolean);
 if(!canSpeak()||!parts.length)return false;
 const voice=speechSynthesis.getVoices().find(v=>/^zh[-_](CN|Hans)/i.test(v.lang)),token={};
 current={token,done,text};
 parts.forEach((p,i)=>{const u=new SpeechSynthesisUtterance(p);u.lang='zh-CN';if(voice)u.voice=voice;u.onerror=()=>finish(token);if(i===parts.length-1)u.onend=()=>finish(token);speechSynthesis.speak(u);});
 return true;
}
export function stopSpeaking(){if(!current)return;const {token}=current;speechSynthesis.cancel();finish(token);}
// A toggle button whose <span> label switches between its own text and「停止讲解」. text may be a function, read on click.
// A button re-rendered while its text is being read picks the reading up instead of showing idle.
export function bindSpeak(button,text){
 if(!button)return;
 if(!canSpeak()){button.hidden=true;return;}
 const label=button.querySelector('span'),idle=label?.textContent;
 const show=on=>{button.classList.toggle('speaking',on);button.setAttribute('aria-pressed',String(on));if(label)label.textContent=on?'停止讲解':idle;},reset=()=>show(false);
 show(false);
 if(typeof text==='string'&&current?.text===text){current.done=reset;show(true);}
 button.onclick=()=>{
  if(button.classList.contains('speaking'))return stopSpeaking();
  if(speak(typeof text==='function'?text():text,reset))show(true);
 };
}
