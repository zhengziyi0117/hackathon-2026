import {escapeHTML as e} from './core.js';
import {answerSpot} from './scenic-core.js';
// One guide conversation, shared by the 3D spot scene (embedded NPC) and the studio preview.
// With the local server it asks Claude, grounded in spot.guide / spot.notice plus map-computed neighbours;
// otherwise (or on any failure) it falls back to sentence retrieval from the same material.
const ic=n=>`<i data-lucide="${n}"></i>`;
const logs=new Map();// Per spot, so walking back to a spot keeps the conversation.
let health;
const caps=()=>health||=fetch('/api/health',{signal:AbortSignal.timeout(1500)}).then(r=>r.ok?r.json():{}).catch(()=>({}));
// Only "where next" questions; "附近有厕所吗" must not turn into a list of spots.
const NEXT=/下一站|下一个|接下来去|还能去|去哪|顺路去|附近.*景点|推荐.*景点/;
const answerLabel=m=>m.source==='map'?'按景区地图计算 · 不是实地导航':m.known?(m.mode==='llm'?'AI 导游 · 依据景区讲解资料':'摘自景区讲解资料'):'资料中没有 · 不作推测';
const short=name=>String(name||'').split(' · ')[0];
// neighbours: [{id,name,dir,minutes,boat}] from the map package; the guide may only recommend these.
export const nearbyText=neighbours=>neighbours.map(n=>`往${n.dir}${n.boat?'坐船':'步行'}约 ${n.minutes} 分钟到${short(n.name)}`).join('；');
export function nextAnswer(neighbours){
  if(!neighbours.length)return {text:'地图上还没有标出这里附近的景点，可以回到大地图看看。',known:false,source:'map',suggest:[]};
  return {text:'从这里可以'+nearbyText(neighbours)+'。点下面的名字，我带你走到那边的门口。',known:true,source:'map',suggest:neighbours.map(n=>n.id)};
}
// Which neighbours an answer mentions, so their portals can light up and offer "take me there".
export const mentioned=(text,neighbours)=>neighbours.filter(n=>String(text).includes(short(n.name))).map(n=>n.id);

export function mountGuideChat(el,{spot,neighbours=[],onSuggest,onGo,onAnswer,title='问问导游',compact=false,hydrate}){
  let alive=true;
  const log=logs.get(spot.id)||[];logs.set(spot.id,log);
  const chips=['讲讲这里','名字怎么来的',...(neighbours.length?['下一站去哪']:[]),'有什么提示'];
  el.innerHTML=`<section class="sw-guide${compact?' is-compact':''}" aria-label="AI 导游"><div class="sw-guide-head">${ic('sparkles')}<b>${e(title)}</b><small>只依据景区讲解资料回答</small></div><div class="sw-guide-log" aria-live="polite"></div><div class="sw-guide-chips">${chips.map(q=>`<button type="button" data-guide-q="${q}">${q}</button>`).join('')}</div><form class="sw-guide-form"><input maxlength="200" autocomplete="off" placeholder="关于${e(short(spot.name))}，你想知道…" aria-label="向导游提问"><button type="submit" aria-label="发送">${ic('arrow-up')}</button></form></section>`;
  const logEl=el.querySelector('.sw-guide-log'),input=el.querySelector('input');
  const goHTML=ids=>ids.length&&onGo?`<div class="sw-guide-go">${ids.map(id=>{const n=neighbours.find(x=>x.id===id);return n?`<button type="button" data-guide-go="${e(id)}">${ic('footprints')}带我去${e(short(n.name))}</button>`:'';}).join('')}</div>`:'';
  function render(){
    logEl.innerHTML=log.length?log.map(m=>m.role==='user'?`<p class="sw-guide-q">${e(m.text)}</p>`:m.pending?`<div class="sw-guide-a is-pending"><p><span class="sw-typing" aria-label="导游正在回答"><i></i><i></i><i></i></span></p></div>`:`<div class="sw-guide-a"><p>${e(m.text)}</p><small>${answerLabel(m)}</small>${goHTML(m.suggest||[])}</div>`).join(''):'<p class="sw-guide-empty">点一个问题，或者直接问。</p>';
    logEl.scrollTop=logEl.scrollHeight;
    logEl.querySelectorAll('[data-guide-go]').forEach(b=>b.onclick=()=>onGo(b.dataset.guideGo));
    hydrate?.();
  }
  async function answer(q,history){
    if(NEXT.test(q))return nextAnswer(neighbours);
    if((await caps()).guide)try{
      const r=await fetch('/api/guide',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:spot.name,guide:spot.guide||spot.description||'',notice:spot.notice||'',nearby:nearbyText(neighbours),question:q,history}),signal:AbortSignal.timeout(35000)});
      if(r.ok)return await r.json();
    }catch{}
    return answerSpot(spot,q);
  }
  async function ask(q){
    q=String(q||'').trim();if(!q||log.some(m=>m.pending))return;
    const history=log.map(m=>({role:m.role==='user'?'user':'assistant',text:m.text}));
    const reply={role:'guide',pending:true,text:''};log.push({role:'user',text:q},reply);render();
    const a=await answer(q,history);
    Object.assign(reply,a,{pending:false,suggest:a.suggest||mentioned(a.text,neighbours)});
    if(log.length>12)log.splice(0,log.length-12);
    if(!alive)return;
    render();onAnswer?.(reply);if(reply.suggest.length)onSuggest?.(reply.suggest);
  }
  el.querySelectorAll('[data-guide-q]').forEach(b=>b.onclick=()=>ask(b.dataset.guideQ));
  el.querySelector('form').onsubmit=ev=>{ev.preventDefault();ask(input.value);input.value='';};
  render();
  return {ask,focus(){input.focus({preventScroll:true});},reset(){log.length=0;render();},dispose(){alive=false;}};
}
// Studio edits change the material; the old answers no longer apply.
export const forgetGuide=id=>logs.delete(id);
