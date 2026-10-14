import {escapeHTML as e} from './core.js';
import {PILOT_SOURCE,PILOT_ID} from './scenic-places.js';
import {roamBounds,worldAsset} from './scenic-core.js';
import {loadScenic} from './scenic-store.js';
import {webImageUrl} from './web-images.js';
const ic=name=>`<i data-lucide="${name}"></i>`;
// Shared by the visitor page and the studio's 3D tab. The viewer reads config.bounds on every move, so setRoam applies live.
// asset: {spz, receipt} from worldAsset(); the receipt carries scale, ground offset and the start view.
export function mountPilotScene(el,{asset,roam,onStatus,onPosition}={}){
 let disposed=false,viewer;const config={bounds:roamBounds(roam)};
 const ready=Promise.all([import('./viewer.js'),fetch(asset.receipt).then(r=>{if(!r.ok)throw Error('Missing receipt');return r.json();})]).then(([{createViewer},receipt])=>{
  if(disposed)return null;
  const eye=receipt.semantics.ground_plane_offset;
  Object.assign(config,receipt.semantics,{home:receipt.view?.home||[0,eye,0],target:receipt.view?.target||[0,eye,-4]});
  viewer=createViewer(el,{points:[],splatURL:asset.spz,splatConfig:config,onStatus:v=>{if(!disposed)onStatus?.(v);},onPosition:p=>{if(!disposed)onPosition?.(p);}});
  return viewer;
 }).catch(()=>{if(!disposed)onStatus?.('error');return null;});
 return {ready,setRoam(r){config.bounds=roamBounds(r);},dispose(){disposed=true;viewer?.dispose();}};
}
export function mountPilotWorld(host,{hydrate}){
 let disposed=false,scene;
 const params=new URLSearchParams(location.hash.split('?')[1]),sid=params.get('s')||'westlake',id=params.get('id')||PILOT_ID,back='#map?s='+encodeURIComponent(sid)+'&id='+encodeURIComponent(id);
 host.innerHTML=`<main class="sw-pilot"><section class="sw-pilot-scene" id="pilot-scene" aria-label="3D 漫游"><div class="sw-pilot-top"><a class="sw-pilot-chip" href="${e(back)}">${ic('arrow-left')}<span id="pilot-name">返回地图</span></a><div class="sw-pilot-tools"><button class="sw-pilot-chip" id="pilot-reset" aria-label="回到起点">${ic('rotate-ccw')}<span>回到起点</span></button><details class="sw-pilot-info"><summary class="sw-pilot-chip" aria-label="关于这个 3D 场景">${ic('info')}</summary><div id="pilot-about"></div></details></div></div><div class="sw-pilot-bottom"><div class="sw-pilot-status"><span id="pilot-status" role="status">正在载入 3D 场景…</span><span class="sw-pilot-hint">拖动环顾 · WASD 移动 · Q / E 升降</span><span id="pilot-distance">距起点 0.0 m</span></div><div class="sw-pilot-controls" role="group" aria-label="漫游移动"><button data-pilot-move="up" aria-label="升高视点">${ic('chevrons-up')}</button><button data-pilot-move="forward" aria-label="向前移动">${ic('arrow-up')}</button><button data-pilot-move="down" aria-label="降低视点">${ic('chevrons-down')}</button><button data-pilot-move="left" aria-label="向左移动">${ic('arrow-left')}</button><button data-pilot-move="back" aria-label="向后移动">${ic('arrow-down')}</button><button data-pilot-move="right" aria-label="向右移动">${ic('arrow-right')}</button></div></div></section></main>`;
 hydrate();
 const status=host.querySelector('#pilot-status'),sceneEl=host.querySelector('#pilot-scene');
 const fail=(text,cover)=>{status.textContent=text;sceneEl.classList.add('sw-pilot-failed');if(cover)sceneEl.style.backgroundImage=`linear-gradient(#123b3150,#123b3180),url("${cover.replace(/["\\]/g,'\\$&')}")`;};
 // The scene and roaming range come from the published snapshot.
 loadScenic().catch(()=>null).then(state=>{
  if(disposed)return;
  const spot=state?.scenics.find(x=>x.id===sid)?.published?.spots.find(s=>s.id===id),asset=worldAsset(spot);
  const cover=spot&&webImageUrl((spot.photos.front||Object.values(spot.photos)[0])?.url||'');
  if(spot){host.querySelector('#pilot-name').textContent=spot.name;sceneEl.setAttribute('aria-label',spot.name+' · 3D 漫游');}
  if(!asset)return fail('这个景点还没有 3D 场景，请返回地图看照片',cover);
  const credit=asset.generated?'':`<p>原摄影：${e(PILOT_SOURCE.artist)}，2021-01-17；景见 AI 衍生，2026-10-12。<a href="${e(PILOT_SOURCE.source)}" target="_blank" rel="noopener">原图来源</a> · <a href="${e(PILOT_SOURCE.licenseUrl)}" target="_blank" rel="noopener">CC BY-SA 4.0</a></p>`;
  host.querySelector('#pilot-about').innerHTML=`<h3>关于这个 3D 场景</h3><p>${e(asset.note)}漫游范围限制在照片拍到的区域附近，范围内仍可能有变形；不能用于判断实地路线。<a href="${e(asset.receipt)}" target="_blank" rel="noopener">生成记录</a></p>${credit}`;
  scene=mountPilotScene(sceneEl,{asset,roam:spot.roam,
   onStatus:v=>{if(v==='error')fail(asset.generated?'3D 场景未能载入。本机生成的场景需要通过 npm start 打开':'3D 场景未能载入，请返回地图看照片',cover);else status.textContent=v==='splat'?'可以开始漫游':'正在载入 3D 场景…';},
   onPosition:({distance,edge})=>{host.querySelector('#pilot-distance').textContent=(edge?'已到可漫游范围边缘 · ':'')+'距起点 '+distance.toFixed(1)+' m';}});
  scene.ready.then(viewer=>{
   if(!viewer||disposed)return;
   host.querySelector('#pilot-reset').onclick=()=>viewer.reset();
   host.querySelectorAll('[data-pilot-move]').forEach(b=>{
    let held=false,started=0;
    b.onpointerdown=ev=>{held=true;started=performance.now();b.setPointerCapture(ev.pointerId);viewer.setMove(b.dataset.pilotMove,true);};
    const release=()=>{held=false;viewer.setMove(b.dataset.pilotMove,false);};
    b.onpointerup=release;b.onpointercancel=release;b.onlostpointercapture=release;b.onblur=release;
    b.onclick=ev=>{if(!held&&(ev.detail===0||performance.now()-started<180))viewer.move(b.dataset.pilotMove);};
   });
  });
 });
 return()=>{disposed=true;scene?.dispose();};
}
