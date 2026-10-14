import {escapeHTML as e} from './core.js';
import {defaultScenicId,settings} from './content/catalog.js';
import {roamBounds,worldAsset,worldVariants} from './scenic-core.js';
import {loadScenic} from './scenic-store.js';
import {webImageUrl} from './web-images.js';
import {geoFor} from './geo-registry.js';
import {bindSpeak,stopSpeaking} from './narration.js';
import {mountGuideChat} from './guide-chat.js';
const ic=name=>`<i data-lucide="${name}"></i>`;
// Shared by the visitor page and the studio's 3D tab. The viewer reads config.bounds on every move, so setRoam applies live.
// asset: {spz, receipt} from worldAsset(); the receipt carries scale, ground offset and the start view.
// mode 'third' adds the walking avatar (visitor page); the studio keeps the first-person camera for calibration.
export function mountPilotScene(el,{asset,roam,mode='first',onStatus,onPosition,onFrame,onMode,onInteract}={}){
 let disposed=false,viewer;const config={bounds:roamBounds(roam)};
 const actors=mode==='third'?import('./pilot-actors.js'):Promise.resolve(null);
 const ready=Promise.all([import('./viewer.js'),fetch(asset.receipt).then(r=>{if(!r.ok)throw Error('Missing receipt');return r.json();}),actors]).then(([{createViewer},receipt,act])=>{
  if(disposed)return null;
  const eye=receipt.semantics.ground_plane_offset;
  Object.assign(config,receipt.semantics,{home:receipt.view?.home||[0,eye,0],target:receipt.view?.target||[0,eye,-4]});
  viewer=createViewer(el,{points:[],splatURL:asset.spz,splatConfig:config,mode,avatar:act?.createAvatar()||null,onFrame,onMode,onInteract,onStatus:v=>{if(!disposed)onStatus?.(v);},onPosition:p=>{if(!disposed)onPosition?.(p);}});
  return viewer;
 }).catch(()=>{if(!disposed)onStatus?.('error');return null;});
 return {ready,config,actors,setRoam(r){config.bounds=roamBounds(r);},dispose(){disposed=true;viewer?.dispose();}};
}
const VIEWS=[['front','正面',{yaw:0,pitch:0}],['left','左看',{yaw:Math.PI/2.4}],['right','右看',{yaw:-Math.PI/2.4}],['behind','回身',{yaw:Math.PI}],['above','俯瞰',{pitch:-.62,rise:.4}]];
const short=s=>s.name.split(' · ')[0];
const HINT={third:'拖动转视角 · WASD 行走 · Shift 跑 · F 对话 / 进门 · V 第一人称',first:'拖动环顾 · WASD 移动 · Q / E 升降 · V 第三人称'};
const TALK=1.6,ENTER=1.1;// metres: where the guide prompt and a portal prompt appear

// Visitor page for one spot: the generated 3D world when there is one, otherwise the real photo.
// The guide stands in the scene; neighbouring spots are moon-gate portals in their real compass direction.
export function mountPilotWorld(host,{hydrate}){
 let disposed=false,scene,viewer,chat,bubbleTimer;
 const params=new URLSearchParams(location.hash.split('?')[1]),sid=params.get('s')||defaultScenicId,id=params.get('id')||settings.featuredSpot,want=params.get('variant');
 // The studio opens this page with &heading= to check a calibration before adopting it.
 const G=geoFor(sid),previewHeading=params.has('heading')?Number(params.get('heading')):NaN;
 const q=x=>'?s='+encodeURIComponent(sid)+'&id='+encodeURIComponent(x);
 host.innerHTML=`<main class="pw" id="pw"><section class="pw-scene" id="pilot-scene" aria-label="景点漫游"></section><div class="pw-signs" id="pw-signs"></div>
 <div class="pw-bubble" id="pw-bubble" hidden></div><div class="pw-prompt" id="pw-prompt" hidden></div>
 <header class="pw-top"><a class="m3-chip" href="#map${q(id)}">${ic('map')}<span>回到大地图</span></a><div class="pw-title"><small id="pw-scene-name">西湖</small><h1 id="pilot-name">正在前往…</h1></div><div class="pw-tools" id="pw-tools"></div></header>
 <aside class="pw-guide" id="pw-guide" aria-label="导游对话" hidden><button class="plain pw-guide-close" id="pw-guide-close" aria-label="收起导游对话">${ic('x')}</button><div id="pw-guide-chat"></div></aside>
 <div class="pw-bottom" id="pw-bottom"></div><div class="m3-veil on" id="pw-veil"></div></main>`;
 hydrate();
 const $=s=>host.querySelector(s),sceneEl=$('#pilot-scene');
 const veil=(spot,lead)=>{const p=spot?.photos.front||Object.values(spot?.photos||{})[0];$('#pw-veil').innerHTML=`<div class="pw-veil-photo" style="background-image:url('${e(webImageUrl(p?.url||''))}')"></div><p><small>${lead}</small>${e(spot?short(spot):'')}</p>`;};
 const go=(href,spot)=>{if(spot)veil(spot,'正在前往');$('#pw-veil').classList.add('on');setTimeout(()=>{if(!disposed)location.hash=href;},650);};
 loadScenic().catch(()=>null).then(state=>{
  if(disposed)return;
  const spots=state?.scenics.find(x=>x.id===sid)?.published?.spots||[],spot=spots.find(s=>s.id===id);
  if(!spot){$('#pilot-name').textContent='这个景点暂时没有开放';$('#pw-veil').classList.remove('on');return;}
  const geo=G?.SPOT_GEO[id],variants=worldVariants(spot),asset=variants.find(v=>v.id===want)||variants[0];
  $('#pilot-name').textContent=spot.name;veil(spot,'正在走进');$('#pw-scene-name').textContent=geo?.scene||'景点';
  const nbs=(G?G.neighboursOf(id,spots.map(s=>s.id),3):[]).map(n=>({...n,spot:spots.find(s=>s.id===n.id)}));
  const toSpot=nid=>nbs.find(n=>n.id===nid);
  const signHTML=(n,compass)=>`<button class="pw-sign" data-go="${e(n.id)}"><i class="pw-arrow"${compass?` style="rotate:${Math.round(n.bearing)}deg"`:''}>${ic('arrow-up')}</i><span><b>${e(short(n.spot))}</b><small>${G.compassName(n.bearing)} · ${n.boat?'游船':'步行'}约 ${n.minutes} 分钟${worldAsset(n.spot)?' · 3D':''}</small></span></button>`;
  const photo=spot.photos.front||Object.values(spot.photos)[0];
  const tools=`<button class="m3-chip" id="pw-ask">${ic('message-circle')}<span>问问导游</span></button>`+(spot.narration?.text?`<button class="m3-chip" id="pw-listen">${ic('volume-2')}<span>听讲解</span></button>`:'');
  // ---- Guide drawer, shared by the photo stage and the 3D stage ----
  const portals=new Map();let enterPortal=()=>{},walkToGuide=null;
  const say=text=>{const b=$('#pw-bubble');if(!b)return;b.textContent=text.length>64?text.slice(0,62)+'…':text;b.hidden=false;clearTimeout(bubbleTimer);bubbleTimer=setTimeout(()=>{if(!disposed)b.hidden=true;},9000);};
  function openGuide(ask){
   const d=$('#pw-guide');d.hidden=false;$('#pw').classList.add('guide-open');
   if(!chat)chat=mountGuideChat($('#pw-guide-chat'),{spot,hydrate,title:'导游 · '+short(spot),compact:true,
    neighbours:nbs.map(n=>({id:n.id,name:n.spot.name,dir:G.compassName(n.bearing),minutes:n.minutes,boat:n.boat})),
    onAnswer:m=>say(m.text),
    onSuggest:ids=>{for(const [pid,p] of portals)p.userData.hot=ids.includes(pid);host.querySelectorAll('#pw-signs [data-go]').forEach(b=>b.classList.toggle('hot',ids.includes(b.dataset.go)));},
    onGo:nid=>{closeGuide();enterPortal(nid);}});
   walkToGuide?.();if(ask)chat.ask(ask);else chat.focus();
  }
  function closeGuide(){$('#pw-guide').hidden=true;$('#pw').classList.remove('guide-open');sceneEl.querySelector('canvas')?.focus({preventScroll:true});}
  $('#pw-guide-close').onclick=closeGuide;
  host.addEventListener('keydown',ev=>{if(ev.key==='Escape'&&!$('#pw-guide').hidden)closeGuide();});
  const autoGuide=params.get('guide');
  if(!asset){
   // Photo stage: no 3D world for this spot yet. The guide drawer and the compass list still work.
   sceneEl.innerHTML=`<div class="pw-photo"><img src="${e(webImageUrl(photo?.url||''))}" alt="${e(spot.name)}"></div>`;
   $('#pw-tools').innerHTML=tools;
   $('#pw-bottom').innerHTML=`<div class="pw-caption"><span class="pw-badge">${ic('image')}实景照片</span><p>${e(spot.description||'')}</p><small>${photo?.credit?`${e(photo.credit.artist)} · <a href="${e(photo.credit.source)}" target="_blank" rel="noopener">原图</a> · ${e(photo.credit.license)} · `:''}这里还没有三维场景，景区补充多角度照片后可生成。</small></div><div class="pw-next"><h3>从这里继续走 · 箭头上北</h3>${nbs.map(n=>signHTML(n,true)).join('')}</div>`;
   enterPortal=nid=>go('#pilot'+q(nid)+'&from=world',toSpot(nid)?.spot);
   hydrate();bindCommon();$('#pw-veil').classList.remove('on');
   const img=sceneEl.querySelector('img');sceneEl.onpointermove=ev=>{const r=sceneEl.getBoundingClientRect();img.style.translate=`${(ev.clientX/r.width-.5)*-24}px ${(ev.clientY/r.height-.5)*-16}px`;};
   if(autoGuide)openGuide();
   return;
  }
  // ---- 3D stage ----
  const multi=asset.id==='multi';
  $('#pw-tools').innerHTML=`${variants.length>1?`<div class="m3-switch" role="group" aria-label="世界模型版本">${variants.map(v=>`<a class="${v===asset?'active':''}" href="#pilot${q(id)}&variant=${v.id}" title="${e(v.label)}">${e(v.short)}</a>`).join('')}</div>`:''}${tools}<button class="m3-chip m3-icon" id="pw-mode" aria-label="切换第一 / 第三人称" title="切换第一 / 第三人称 (V)">${ic('person-standing')}</button><details class="pw-info"><summary class="m3-chip m3-icon" aria-label="关于这个 3D 场景">${ic('info')}</summary><div><h3>关于这个 3D 场景</h3><p>${e(asset.note)}漫游范围限制在照片拍到的区域附近，范围内仍可能变形；不能用于判断实地路线。传送门方向按景点真实方位标注，场景朝向为人工标定；人物和传送门是示意，地面按平面处理，不代表实地可通行。<a href="${e(asset.receipt)}" target="_blank" rel="noopener">生成记录</a></p>${asset.generated?'':`<p>原摄影：${e(photo?.credit?.artist||'')}，${e(photo?.credit?.date||'')}。<a href="${e(photo?.credit?.source||'')}" target="_blank" rel="noopener">原图来源</a> · <a href="${e(photo?.credit?.licenseUrl||'')}" target="_blank" rel="noopener">${e(photo?.credit?.license||'')}</a></p>`}</div></details>`;
  $('#pw-bottom').innerHTML=`<div class="pw-views" role="group" aria-label="视角">${VIEWS.map(([k,label])=>`<button data-view="${k}">${label}</button>`).join('')}</div>
   <div class="pw-status"><span id="pilot-status" role="status">正在载入 3D 场景…</span><span class="pw-hint" id="pw-hint">${HINT.third}</span><span id="pilot-distance">距起点 0.0 m</span></div>
   <div class="pw-pad" role="group" aria-label="漫游移动"><button data-pilot-move="up" aria-label="升高视点">${ic('chevrons-up')}</button><button data-pilot-move="forward" aria-label="向前移动">${ic('arrow-up')}</button><button data-pilot-move="down" aria-label="降低视点">${ic('chevrons-down')}</button><button data-pilot-move="left" aria-label="向左移动">${ic('arrow-left')}</button><button data-pilot-move="back" aria-label="向后移动">${ic('arrow-down')}</button><button data-pilot-move="right" aria-label="向右移动">${ic('arrow-right')}</button></div>`;
  // Floating labels: one per portal plus the guide's name tag; all are real buttons for keyboard and screen readers.
  $('#pw-signs').innerHTML=nbs.map(n=>signHTML(n)).join('')+`<button class="pw-sign pw-npc" id="pw-npc"><i class="pw-arrow">${ic('message-circle')}</i><span><b>导游</b><small>点我或按 F 对话</small></span></button>`;
  $('#pw').classList.add('third');
  hydrate();bindCommon();
  const status=$('#pilot-status'),signs=[...host.querySelectorAll('#pw-signs .pw-sign')],npcTag=$('#pw-npc'),prompt=$('#pw-prompt');
  const fail=text=>{status.textContent=text;sceneEl.classList.add('pw-failed');sceneEl.style.backgroundImage=`linear-gradient(#123b3150,#123b3180),url("${webImageUrl(photo?.url||'').replace(/["\\]/g,'\\$&')}")`;$('#pw-veil').classList.remove('on');};
  let guide=null,guideAt=null,near=null,v,V;
  const heading=Number.isFinite(previewHeading)?previewHeading:Number.isFinite(spot.heading)?spot.heading:geo?.heading||0;
  scene=mountPilotScene(sceneEl,{asset,roam:spot.roam,mode:'third',
   onStatus:x=>{if(x==='error')fail(asset.generated?'3D 场景未能载入。本机生成的场景需要通过 npm start 打开':'3D 场景未能载入，请返回地图看照片');else{status.textContent=x==='splat'?(multi?'六图试验 · 可以开始漫游':'可以开始漫游'):'正在载入 3D 场景…';if(x==='splat')setTimeout(()=>{if(disposed)return;$('#pw-veil').classList.remove('on');if(autoGuide)openGuide();else say(`欢迎来到${short(spot)}。想听故事、问下一站，走近我按 F，或者点我。`);},250);}},
   onPosition:({distance,edge})=>{$('#pilot-distance').textContent=(edge?'已到可漫游范围边缘 · ':'')+'距起点 '+distance.toFixed(1)+' m';},
   onMode:m=>{$('#pw-hint').textContent=HINT[m];$('#pw').classList.toggle('third',m==='third');},
   onInteract:()=>{if(near==='guide')openGuide();else if(near)enterPortal(near);},
   onFrame:(cam,{feet})=>placeLabels(cam,feet)});
  const project=(p,cam,w,h)=>{v.copy(p).applyMatrix4(cam.matrixWorldInverse);const behind=v.z>-.05;const s=p.clone().project(cam);return {x:(s.x*.5+.5)*w,y:(-s.y*.5+.5)*h,ang:Math.atan2(v.x,-v.z),behind};};
  function placeLabels(cam,feet){
   if(!V)return;v||=new V();
   const w=sceneEl.clientWidth,h=sceneEl.clientHeight,hfov=2*Math.atan(Math.tan(cam.fov*Math.PI/360)*cam.aspect),edges={l:0,r:0};
   cam.updateMatrixWorld();
   // Nearest thing the visitor can interact with, for the F prompt.
   let best=null,bd=Infinity;
   if(guideAt){const d=Math.hypot(feet.x-guideAt.x,feet.z-guideAt.z);if(d<TALK&&d<bd){best='guide';bd=d;}guide.userData.hot=d<TALK;}
   for(const [pid,p] of portals){const [ex,,ez]=p.userData.edge,d=Math.hypot(feet.x-ex,feet.z-ez);if(d<ENTER&&d<bd){best=pid;bd=d;}}
   if(best!==near){near=best;prompt.hidden=!near;if(near)prompt.innerHTML=near==='guide'?`<kbd>F</kbd> 和导游聊聊`:`<kbd>F</kbd> 走进门，去${e(short(toSpot(near).spot))}`;}
   nbs.forEach((n,i)=>{
    const s=signs[i],p=portals.get(n.id);if(!s||!p)return;
    const top=p.position.clone();top.y=1.6;const r=project(top,cam,w,h),onscreen=!r.behind&&Math.abs(r.ang)<hfov/2*.86;
    let x,y,rot;
    if(onscreen){x=r.x;y=Math.min(h*.78,Math.max(h*.18,r.y));rot=0;}
    else{const side=r.ang>0?'r':'l';x=side==='r'?w-24:24;y=h*.42+edges[side]++*74;rot=side==='r'?90:-90;}
    s.style.transform=`translate(${x}px,${y}px) translate(${onscreen?'-50%':r.ang>0?'-100%':'0'},-50%)`;s.classList.toggle('ahead',onscreen);s.classList.toggle('compact',!onscreen);s.querySelector('.pw-arrow').style.rotate=rot+'deg';
   });
   if(guideAt){
    const top=guideAt.clone();top.y=2.05;const r=project(top,cam,w,h),show=!r.behind&&Math.abs(r.ang)<hfov/2;
    npcTag.hidden=!show;if(show)npcTag.style.transform=`translate(${r.x}px,${r.y}px) translate(-50%,-100%)`;
    const b=$('#pw-bubble');if(show&&!b.hidden)b.style.transform=`translate(${r.x}px,${r.y-44}px) translate(-50%,-100%)`;else if(!show)b.style.transform='translate(-999px,-999px)';
   }
  }
  Promise.all([scene.ready,scene.actors]).then(([vw,act])=>{
   if(!vw||!act||disposed)return;viewer=vw;V=vw.camera.position.constructor;
   const {home,target,bounds}=scene.config,len=Math.hypot(target[0]-home[0],target[2]-home[2])||1,fx=(target[0]-home[0])/len,fz=(target[2]-home[2])/len;
   // The guide waits a few steps ahead and to the right of the start view, turned toward the visitor.
   guide=vw.add(act.createGuide());
   const gx=home[0]+fx*2.2-fz*1,gz=home[2]+fz*2.2+fx*1;guide.position.set(gx,0,gz);guide.rotation.y=Math.atan2(home[0]-gx,home[2]-gz);guideAt=guide.position;
   walkToGuide=()=>{if(vw.mode==='third')vw.walkTo([gx,0,gz],null,1.1);};
   for(const n of nbs){
    const p=vw.add(act.createPortal()),{at:[x,,z],edge}=act.portalSpot(home,target,heading,n.bearing,bounds);
    p.position.set(x,0,z);p.rotation.y=Math.atan2(home[0]-x,home[2]-z);p.userData.edge=edge;portals.set(n.id,p);
   }
   // Walking up to the gate is part of the transition; the veil shows the next spot while the scene unloads.
   enterPortal=nid=>{const p=portals.get(nid),n=toSpot(nid);if(!p||!n)return;
    const leave=()=>go('#pilot'+q(nid)+'&from=world',n.spot);
    if(vw.mode==='third'){status.textContent='正在走向'+short(n.spot)+'…';vw.walkTo(p.userData.edge,leave,.2);}else leave();};
   host.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{const pr=VIEWS.find(x=>x[0]===b.dataset.view)[2];if(b.dataset.view==='front')vw.reset();vw.look(pr);host.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x===b));});
   $('#pw-mode').onclick=()=>vw.setMode(vw.mode==='third'?'first':'third');
   npcTag.onclick=()=>openGuide();
   host.querySelectorAll('[data-pilot-move]').forEach(b=>{
    let held=false,started=0;
    b.onpointerdown=ev=>{held=true;started=performance.now();b.setPointerCapture(ev.pointerId);vw.setMove(b.dataset.pilotMove,true);};
    const release=()=>{held=false;vw.setMove(b.dataset.pilotMove,false);};
    b.onpointerup=release;b.onpointercancel=release;b.onlostpointercapture=release;b.onblur=release;
    b.onclick=ev=>{if(!held&&(ev.detail===0||performance.now()-started<180))vw.move(b.dataset.pilotMove);};
   });
  });
  function bindCommon(){
   host.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>enterPortal(b.dataset.go));
   bindSpeak($('#pw-listen'),spot.narration?.text);
   $('#pw-ask').onclick=()=>openGuide();
  }
 });
 return()=>{disposed=true;clearTimeout(bubbleTimer);stopSpeaking();chat?.dispose();scene?.dispose();};
}
