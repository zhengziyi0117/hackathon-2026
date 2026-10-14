import {escapeHTML as e} from './core.js';
import {PILOT_SOURCE} from './scenic-places.js';
import {roamBounds,worldAsset,worldVariants} from './scenic-core.js';
import {loadScenic} from './scenic-store.js';
import {webImageUrl} from './web-images.js';
import {geoFor} from './geo-registry.js';
import {bindSpeak,stopSpeaking} from './narration.js';
const ic=name=>`<i data-lucide="${name}"></i>`;
// Shared by the visitor page and the studio's 3D tab. The viewer reads config.bounds on every move, so setRoam applies live.
// asset: {spz, receipt} from worldAsset(); the receipt carries scale, ground offset and the start view.
export function mountPilotScene(el,{asset,roam,onStatus,onPosition,onFrame}={}){
 let disposed=false,viewer;const config={bounds:roamBounds(roam)};
 const ready=Promise.all([import('./viewer.js'),fetch(asset.receipt).then(r=>{if(!r.ok)throw Error('Missing receipt');return r.json();})]).then(([{createViewer},receipt])=>{
  if(disposed)return null;
  const eye=receipt.semantics.ground_plane_offset;
  Object.assign(config,receipt.semantics,{home:receipt.view?.home||[0,eye,0],target:receipt.view?.target||[0,eye,-4]});
  viewer=createViewer(el,{points:[],splatURL:asset.spz,splatConfig:config,onFrame,onStatus:v=>{if(!disposed)onStatus?.(v);},onPosition:p=>{if(!disposed)onPosition?.(p);}});
  return viewer;
 }).catch(()=>{if(!disposed)onStatus?.('error');return null;});
 return {ready,config,setRoam(r){config.bounds=roamBounds(r);},dispose(){disposed=true;viewer?.dispose();}};
}
const VIEWS=[['front','正面',{yaw:0,pitch:0}],['left','左看',{yaw:Math.PI/2.4}],['right','右看',{yaw:-Math.PI/2.4}],['behind','回身',{yaw:Math.PI}],['above','俯瞰',{pitch:-.62,rise:.4}]];
const short=s=>s.name.split(' · ')[0];

// Visitor page for one spot: the generated 3D world when there is one, otherwise the real photo.
// Either way, neighbouring spots appear in their real compass direction so the tour can continue.
export function mountPilotWorld(host,{hydrate}){
 let disposed=false,scene,viewer;
 const params=new URLSearchParams(location.hash.split('?')[1]),sid=params.get('s')||'westlake',id=params.get('id')||'huagang',want=params.get('variant');
 // The studio opens this page with &heading= to check a calibration before adopting it.
 const G=geoFor(sid),previewHeading=params.has('heading')?Number(params.get('heading')):NaN;
 const q=x=>'?s='+encodeURIComponent(sid)+'&id='+encodeURIComponent(x);
 host.innerHTML=`<main class="pw" id="pw"><section class="pw-scene" id="pilot-scene" aria-label="景点漫游"></section><div class="pw-signs" id="pw-signs"></div>
 <header class="pw-top"><a class="m3-chip" href="#map${q(id)}">${ic('map')}<span>回到大地图</span></a><div class="pw-title"><small id="pw-scene-name">西湖</small><h1 id="pilot-name">正在前往…</h1></div><div class="pw-tools" id="pw-tools"></div></header>
 <div class="pw-bottom" id="pw-bottom"></div><div class="m3-veil on" id="pw-veil"></div></main>`;
 hydrate();
 const $=s=>host.querySelector(s),sceneEl=$('#pilot-scene');
 const go=(href)=>{$('#pw-veil').classList.add('on');setTimeout(()=>{if(!disposed)location.hash=href;},650);};
 loadScenic().catch(()=>null).then(state=>{
  if(disposed)return;
  const spots=state?.scenics.find(x=>x.id===sid)?.published?.spots||[],spot=spots.find(s=>s.id===id);
  if(!spot){$('#pilot-name').textContent='这个景点暂时没有开放';$('#pw-veil').classList.remove('on');return;}
  const geo=G?.SPOT_GEO[id],variants=worldVariants(spot),asset=variants.find(v=>v.id===want)||variants[0];
  $('#pilot-name').textContent=spot.name;
  $('#pw-veil').innerHTML=`<div class="pw-veil-photo" style="background-image:url('${e(webImageUrl((spot.photos.front||Object.values(spot.photos)[0])?.url||''))}')"></div><p><small>正在走进</small>${e(short(spot))}</p>`;$('#pw-scene-name').textContent=geo?.scene||'景点';
  const nbs=(G?G.neighboursOf(id,spots.map(s=>s.id),3):[]).map(n=>({...n,spot:spots.find(s=>s.id===n.id)}));
  const signHTML=(n,compass)=>`<button class="pw-sign" data-go="${e(n.id)}"><i class="pw-arrow"${compass?` style="rotate:${Math.round(n.bearing)}deg"`:''}>${ic('arrow-up')}</i><span><b>${e(short(n.spot))}</b><small>${G.compassName(n.bearing)} · ${n.boat?'游船':'步行'}约 ${n.minutes} 分钟${worldAsset(n.spot)?' · 3D':''}</small></span></button>`;
  const photo=spot.photos.front||Object.values(spot.photos)[0];
  const guide=`<a class="m3-chip" href="#spot${q(id)}&guide=1">${ic('message-circle')}<span>问问导游</span></a>`+(spot.narration?.text?`<button class="m3-chip" id="pw-listen">${ic('volume-2')}<span>听讲解</span></button>`:'');
  if(!asset){
   // Photo stage: no 3D world for this spot yet.
   sceneEl.innerHTML=`<div class="pw-photo"><img src="${e(webImageUrl(photo?.url||''))}" alt="${e(spot.name)}"></div>`;
   $('#pw-tools').innerHTML=guide;
   $('#pw-bottom').innerHTML=`<div class="pw-caption"><span class="pw-badge">${ic('image')}实景照片</span><p>${e(spot.description||'')}</p><small>${photo?.credit?`${e(photo.credit.artist)} · <a href="${e(photo.credit.source)}" target="_blank" rel="noopener">原图</a> · ${e(photo.credit.license)} · `:''}这里还没有三维场景，景区补充多角度照片后可生成。</small></div><div class="pw-next"><h3>从这里继续走 · 箭头上北</h3>${nbs.map(n=>signHTML(n,true)).join('')}</div>`;
   hydrate();bindSigns();bindSpeak($('#pw-listen'),spot.narration?.text);$('#pw-veil').classList.remove('on');
   const img=sceneEl.querySelector('img');sceneEl.onpointermove=ev=>{const r=sceneEl.getBoundingClientRect();img.style.translate=`${(ev.clientX/r.width-.5)*-24}px ${(ev.clientY/r.height-.5)*-16}px`;};
   return;
  }
  // 3D stage
  const multi=asset.id==='multi';
  $('#pw-tools').innerHTML=`${variants.length>1?`<div class="m3-switch" role="group" aria-label="世界模型版本">${variants.map(v=>`<a class="${v===asset?'active':''}" href="#pilot${q(id)}&variant=${v.id}" title="${e(v.label)}">${e(v.short)}</a>`).join('')}</div>`:''}${guide}<details class="pw-info"><summary class="m3-chip m3-icon" aria-label="关于这个 3D 场景">${ic('info')}</summary><div><h3>关于这个 3D 场景</h3><p>${e(asset.note)}漫游范围限制在照片拍到的区域附近，范围内仍可能变形；不能用于判断实地路线。路标方向按景点真实方位标注，场景朝向为人工标定。<a href="${e(asset.receipt)}" target="_blank" rel="noopener">生成记录</a></p>${asset.generated?'':`<p>原摄影：${e(PILOT_SOURCE.artist)}，2021-01-17；景见 AI 衍生，2026-10-12。<a href="${e(PILOT_SOURCE.source)}" target="_blank" rel="noopener">原图来源</a> · <a href="${e(PILOT_SOURCE.licenseUrl)}" target="_blank" rel="noopener">CC BY-SA 4.0</a></p>`}</div></details>`;
  $('#pw-bottom').innerHTML=`<div class="pw-views" role="group" aria-label="视角">${VIEWS.map(([k,label])=>`<button data-view="${k}">${label}</button>`).join('')}</div>
   <div class="pw-status"><span id="pilot-status" role="status">正在载入 3D 场景…</span><span class="pw-hint">拖动环顾 · WASD 移动 · Q / E 升降</span><span id="pilot-distance">距起点 0.0 m</span></div>
   <div class="pw-pad" role="group" aria-label="漫游移动"><button data-pilot-move="up" aria-label="升高视点">${ic('chevrons-up')}</button><button data-pilot-move="forward" aria-label="向前移动">${ic('arrow-up')}</button><button data-pilot-move="down" aria-label="降低视点">${ic('chevrons-down')}</button><button data-pilot-move="left" aria-label="向左移动">${ic('arrow-left')}</button><button data-pilot-move="back" aria-label="向后移动">${ic('arrow-down')}</button><button data-pilot-move="right" aria-label="向右移动">${ic('arrow-right')}</button></div>`;
  $('#pw-signs').innerHTML=nbs.map(n=>signHTML(n)).join('');
  hydrate();bindSigns();bindSpeak($('#pw-listen'),spot.narration?.text);
  const status=$('#pilot-status'),signs=[...host.querySelectorAll('#pw-signs .pw-sign')];
  const fail=text=>{status.textContent=text;sceneEl.classList.add('pw-failed');sceneEl.style.backgroundImage=`linear-gradient(#123b3150,#123b3180),url("${webImageUrl(photo?.url||'').replace(/["\\]/g,'\\$&')}")`;$('#pw-veil').classList.remove('on');};
  // Signpost anchors: compass bearing minus the world's start heading gives a direction relative to the start view.
  const anchors=[];let v;
  scene=mountPilotScene(sceneEl,{asset,roam:spot.roam,
   onStatus:x=>{if(x==='error')fail(asset.generated?'3D 场景未能载入。本机生成的场景需要通过 npm start 打开':'3D 场景未能载入，请返回地图看照片');else{status.textContent=x==='splat'?(multi?'六图试验 · 可以开始漫游':'可以开始漫游'):'正在载入 3D 场景…';if(x==='splat')setTimeout(()=>!disposed&&$('#pw-veil').classList.remove('on'),250);}},
   onPosition:({distance,edge})=>{$('#pilot-distance').textContent=(edge?'已到可漫游范围边缘 · ':'')+'距起点 '+distance.toFixed(1)+' m';},
   onFrame:cam=>placeSigns(cam)});
  function placeSigns(cam){
   const V=cam.position.constructor;v||=new V();
   if(!anchors.length&&scene.config.home){
    const [hx,hy,hz]=scene.config.home,[tx,,tz]=scene.config.target,len=Math.hypot(tx-hx,tz-hz)||1,fx=(tx-hx)/len,fz=(tz-hz)/len;
    const heading=Number.isFinite(previewHeading)?previewHeading:Number.isFinite(spot.heading)?spot.heading:geo?.heading||0;
    for(const n of nbs){const rel=(n.bearing-heading)*Math.PI/180;anchors.push(new V(hx+(fx*Math.cos(rel)-fz*Math.sin(rel))*6,hy-.15,hz+(fz*Math.cos(rel)+fx*Math.sin(rel))*6));}
   }
   const w=sceneEl.clientWidth,h=sceneEl.clientHeight,hfov=2*Math.atan(Math.tan(cam.fov*Math.PI/360)*cam.aspect),edges={l:0,r:0};
   cam.updateMatrixWorld();
   anchors.forEach((a,i)=>{
    const s=signs[i];if(!s)return;v.copy(a).applyMatrix4(cam.matrixWorldInverse);const ang=Math.atan2(v.x,-v.z),onscreen=Math.abs(ang)<hfov/2*.86;
    let x,y,rot;
    if(onscreen){const p=a.clone().project(cam);x=(p.x*.5+.5)*w;y=Math.min(h*.7,Math.max(h*.3,(-p.y*.5+.5)*h));rot=0;}
    else{const side=ang>0?'r':'l';x=side==='r'?w-24:24;y=h*.42+edges[side]++*74;rot=side==='r'?90:-90;}
    s.style.transform=`translate(${x}px,${y}px) translate(${onscreen?'-50%':ang>0?'-100%':'0'},-50%)`;s.classList.toggle('ahead',onscreen);s.querySelector('.pw-arrow').style.rotate=rot+'deg';
   });
  }
  scene.ready.then(vw=>{
   if(!vw||disposed)return;viewer=vw;
   host.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{const p=VIEWS.find(x=>x[0]===b.dataset.view)[2];if(b.dataset.view==='front')vw.reset();vw.look(p);host.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x===b));});
   host.querySelectorAll('[data-pilot-move]').forEach(b=>{
    let held=false,started=0;
    b.onpointerdown=ev=>{held=true;started=performance.now();b.setPointerCapture(ev.pointerId);vw.setMove(b.dataset.pilotMove,true);};
    const release=()=>{held=false;vw.setMove(b.dataset.pilotMove,false);};
    b.onpointerup=release;b.onpointercancel=release;b.onlostpointercapture=release;b.onblur=release;
    b.onclick=ev=>{if(!held&&(ev.detail===0||performance.now()-started<180))vw.move(b.dataset.pilotMove);};
   });
  });
  function bindSigns(){host.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>go('#pilot'+q(b.dataset.go)+'&from=world'));}
 });
 return()=>{disposed=true;stopSpeaking();scene?.dispose();};
}
