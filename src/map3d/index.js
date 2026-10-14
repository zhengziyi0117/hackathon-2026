import * as T from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {escapeHTML as e} from '../core.js';
import {loadScenic} from '../scenic-store.js';
import {worldAsset} from '../scenic-core.js';
import {webImageUrl} from '../web-images.js';
import {NODES,SPOT_GEO,PLACES,CAUSEWAYS,walkable,terrainHeight,groundHeight,landField,shortestPath,nearestNode,neighboursOf,compassName,pointOnPolyline,GEO_FRAME} from '../westlake-geo.js';
import {createWorld,MOODS} from './scene.js';
import {traveler} from './models.js';
import {loadStamps,saveStamp} from './stamps.js';
import {bindSpeak,stopSpeaking} from '../narration.js';


const ic=n=>`<i data-lucide="${n}"></i>`;
const SESSION='jj-map3d-osm';
const TiltShift={uniforms:{tDiffuse:{value:null},uRes:{value:new T.Vector2(1,1)},uFocus:{value:.52},uRange:{value:.36},uAmount:{value:1}},
 vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
 fragmentShader:`uniform sampler2D tDiffuse;uniform vec2 uRes;uniform float uFocus,uRange,uAmount;varying vec2 vUv;
void main(){float d=abs(vUv.y-uFocus);float b=smoothstep(uRange*.35,uRange,d)*uAmount*7.;vec4 c=vec4(0.);
for(int i=0;i<20;i++){float a=float(i)*2.39996,r=sqrt((float(i)+.5)/20.);c+=texture2D(tDiffuse,vUv+vec2(cos(a),sin(a))*r*b/uRes);}c/=20.;
vec2 q=vUv-.5;c.rgb*=1.-dot(q,q)*.55;gl_FragColor=c;}`};

export function mountMap3D(host,{hydrate,toast}){
 const params=new URLSearchParams(location.hash.split('?')[1]),sid=params.get('s')||'westlake',focusId=params.get('id');
 const saved=JSON.parse(sessionStorage.getItem(SESSION)||'null');
 let alive=true,frame,renderer,spots=[],selected=null,near=null,stamps=loadStamps(sid);
 host.innerHTML=`<main class="m3" id="m3">
 <div class="m3-stage" id="m3-stage"></div>
 <div class="m3-places" id="m3-places" aria-hidden="true"></div>
 <div class="m3-tags" id="m3-tags"></div>
 <div class="m3-bubble" id="m3-bubble" hidden></div>
 <div class="m3-me" id="m3-me" aria-hidden="true"><span></span></div>
 <header class="m3-top">
  <div class="m3-title"><a class="m3-chip m3-icon" href="#scenics" aria-label="全部景区">${ic('arrow-left')}</a><div><small>JINGJIAN · 西湖</small><h1>湖山微缩游</h1></div></div>
  <div class="m3-actions">
   <button class="m3-compass" id="m3-compass" aria-label="正北朝上"><span id="m3-needle">${ic('navigation-2')}</span><b>北</b></button>
   <div class="m3-switch" role="group" aria-label="地图风格"><a class="active" aria-current="page">${ic('box')}微缩 3D</a><a href="#map?s=${encodeURIComponent(sid)}&view=scroll">${ic('scroll')}绘卷 2D</a></div>
  </div>
 </header>
 <aside class="m3-card" id="m3-card" hidden></aside>
 <div class="m3-bottom">
  <button class="m3-passport" id="m3-passport">${ic('stamp')}<span>游园印章</span><b id="m3-count">0/0</b></button>
  <div class="m3-moods" role="group" aria-label="西湖十景时节">${Object.entries(MOODS).map(([id,m])=>`<button data-mood="${id}" title="${m.name}"><b>${m.short}</b><small>${m.name}</small></button>`).join('')}</div>
  <p class="m3-hint" id="m3-hint">点地面让小人走过去 · 拖动旋转 · 右键平移 · 滚轮缩放 · WASD 漫步</p>
 </div>
 <section class="m3-book" id="m3-book" hidden></section>
 <div class="m3-seal-fx" id="m3-seal-fx" hidden></div>
 <a class="m3-osm" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">湖岸与堤岛 © OpenStreetMap 贡献者</a>
 <div class="m3-veil" id="m3-veil"></div>
 <div class="m3-loading" id="m3-loading"><div><span>景</span><span>见</span></div><p id="m3-load-text">正在铺开湖山…</p></div>
</main>`;
 hydrate();
 const $=s=>host.querySelector(s),$$=s=>[...host.querySelectorAll(s)],stage=$('#m3-stage');
 try{renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'});}
 catch{$('#m3-load-text').innerHTML='当前浏览器未开启三维渲染。<a href="#map?s='+encodeURIComponent(sid)+'&view=scroll">改看绘卷地图</a>';return()=>{};}
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
 renderer.toneMapping=T.ACESFilmicToneMapping;renderer.outputColorSpace=T.SRGBColorSpace;stage.append(renderer.domElement);
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(30,1,.5,900),world=createWorld(scene);
 const composer=new EffectComposer(renderer),bloom=new UnrealBloomPass(new T.Vector2(1,1),.55,.55,.9),tilt=new ShaderPass(TiltShift);
 composer.addPass(new RenderPass(scene,camera));composer.addPass(bloom);composer.addPass(tilt);composer.addPass(new OutputPass());
 const resize=()=>{const w=stage.clientWidth,h=stage.clientHeight;if(!w||!h)return;renderer.setSize(w,h);composer.setSize(w,h);composer.setPixelRatio(renderer.getPixelRatio());camera.aspect=w/h;camera.updateProjectionMatrix();tilt.uniforms.uRes.value.set(w,h);};
 const ro=new ResizeObserver(resize);ro.observe(stage);resize();

 // Camera rig: orbit around a target; goal values are eased in every frame.
 const rig={target:new T.Vector3(-1,0,-1),dist:110,theta:-1.6,phi:.18},goal={target:new T.Vector3(-2.5,0,-1),dist:80,theta:-.55,phi:.78};
 let ease=1.4,follow=false,userAt=0;
 const placeCamera=()=>{const s=Math.sin(rig.phi);camera.position.set(rig.target.x+s*Math.sin(rig.theta)*rig.dist,rig.target.y+Math.cos(rig.phi)*rig.dist,rig.target.z+s*Math.cos(rig.theta)*rig.dist);camera.lookAt(rig.target);};
 const clampTarget=v=>{const b=GEO_FRAME.bounds;v.x=Math.max(b.minX+2,Math.min(b.maxX-2,v.x));v.z=Math.max(b.minZ+2,Math.min(b.maxZ-2,v.z));return v;};

 // Place names floating over the map: water, causeways, islands and hills.
 const su=CAUSEWAYS[0].points,bai=CAUSEWAYS[1].points,lab=(name,at,kind,y=.5)=>({name,at,kind,y:Math.max(.2,terrainHeight(...at))+y});
 const PLACE_LABELS=[lab('苏 堤',pointOnPolyline(su,.42),'dike',.35),lab('白 堤',pointOnPolyline(bai,.62),'dike',.35),lab('孤 山',PLACES.gushan,'hill',.9),lab('小瀛洲',[PLACES.xiaoyingzhou[0]+1.6,PLACES.xiaoyingzhou[1]-.6],'isle',.3),lab('西 湖',[3.5,-3],'lake',.1),lab('北里湖',[-3.6,-13.4],'lake',.1),lab('西里湖',[-14.2,1],'lake',.1),lab('宝石山',PLACES.baoshi,'hill',1),lab('南屏山',PLACES.nanping,'hill',1),lab('湖 滨',[17.5,-2],'city',.6)];
 const placeEls=[];$('#m3-places').innerHTML=PLACE_LABELS.map(p=>`<span class="m3-place ${p.kind}">${p.name}</span>`).join('');placeEls.push(...$$('.m3-place'));

 // Traveller
 const hero=traveler();hero.scale.setScalar(1.45);scene.add(hero);
 const start=focusId&&SPOT_GEO[focusId]?NODES[SPOT_GEO[focusId].node]:saved?.hero||NODES.dq;
 const me={x:start[0],z:start[1],heading:Math.PI,route:[],mode:'walk',goal:null,moving:false,walked:0};
 const keys=new Set();

 const markSeen=()=>{const h=$('#m3-hint');if(h&&!h.classList.contains('gone')){h.classList.add('gone');}};
 const straight=(ax,az,bx,bz)=>{const n=Math.ceil(Math.hypot(bx-ax,bz-az)/.12);for(let i=1;i<=n;i++)if(!walkable(ax+(bx-ax)*i/n,az+(bz-az)*i/n))return false;return true;};
 function plan(tx,tz){
  if(straight(me.x,me.z,tx,tz))return [{x:tx,z:tz,mode:'walk'}];
  const nodes=Object.entries(NODES).map(([id,[x,z]])=>({id,d:Math.hypot(x-me.x,z-me.z)})).sort((a,b)=>a.d-b.d);
  const s=(nodes.slice(0,8).find(n=>straight(me.x,me.z,...NODES[n.id]))||nodes[0]).id;
  const targetWalkable=walkable(tx,tz),endNode=(targetWalkable?Object.keys(NODES).map(id=>({id,d:Math.hypot(NODES[id][0]-tx,NODES[id][1]-tz)})).sort((a,b)=>a.d-b.d).slice(0,6).find(n=>straight(...NODES[n.id],tx,tz)):null)?.id||nearestNode(tx,tz).id;
  const r=shortestPath(s,endNode);if(!r)return [];
  const out=[{x:NODES[s][0],z:NODES[s][1],mode:'walk'}];
  r.legs.forEach((leg,i)=>out.push({x:NODES[r.nodes[i+1]][0],z:NODES[r.nodes[i+1]][1],mode:leg.mode}));
  if(targetWalkable&&straight(...NODES[endNode],tx,tz))out.push({x:tx,z:tz,mode:'walk'});
  return out;
 }
 function walkTo(tx,tz,spotId=null){
  me.route=plan(tx,tz);me.goal=spotId;follow=true;markSeen();
  if(!me.route.length)toast('那里暂时走不过去，换个地方试试');
  else if(me.route.some(p=>p.mode==='boat'))toast('乘游船过湖');
  drawRoute();
 }
 const routeLine=new T.Line(new T.BufferGeometry(),new T.LineDashedMaterial({color:'#fff6df',dashSize:.25,gapSize:.18,transparent:true,opacity:.95,depthTest:false}));routeLine.renderOrder=5;scene.add(routeLine);
 function drawRoute(){
  const pts=[[me.x,me.z],...me.route.map(p=>[p.x,p.z])].map(([x,z])=>new T.Vector3(x,Math.max(.08,groundHeight(x,z))+.06,z));
  routeLine.geometry.dispose();routeLine.geometry=new T.BufferGeometry().setFromPoints(pts.length>1?pts:[]);routeLine.computeLineDistances();routeLine.visible=pts.length>1;
 }

 // Spots from the published scenic snapshot; positions come from the shared geo data.
 const posOf=s=>SPOT_GEO[s.id]?.label||[-15+30*(s.x??.5),-17+31*(s.y??.5)];
 const nodeOf=s=>SPOT_GEO[s.id]?.node||nearestNode(...posOf(s)).id;
 function tagSub(s){const [main,sub]=s.name.split(' · '),scene=SPOT_GEO[s.id]?.scene?.replace('西湖十景 · ','');return sub||(scene&&scene!==main?scene:'西湖十景');}
 function tagsHTML(){return spots.map((s,i)=>`<button class="m3-tag ${stamps[s.id]?'stamped':''}" data-spot="${e(s.id)}" style="--i:${i}"><i class="m3-seal-mini">${stamps[s.id]?'印':String(i+1).padStart(2,'0')}</i><span><b>${e(s.name.split(' · ')[0])}</b><small>${e(tagSub(s))}</small></span>${worldAsset(s)?'<em>3D</em>':''}</button>`).join('');}
 function bindTags(){$$('[data-spot]').forEach(b=>b.onclick=ev=>{ev.stopPropagation();selectSpot(b.dataset.spot,true);});}
 function updateCount(){$('#m3-count').textContent=spots.filter(s=>stamps[s.id]).length+'/'+spots.length;}
 const anchorOf=id=>{const w=world.spots[id],s=spots.find(x=>x.id===id),[x,z]=posOf(s);return new T.Vector3(x,(w?w.object.position.y+w.top:terrainHeight(x,z)+.8)+.25,z);};

 function cardHTML(s){
  const geo=SPOT_GEO[s.id],photo=s.photos.front||Object.values(s.photos)[0],w=worldAsset(s),here=near===s.id;
  const nb=neighboursOf(s.id,spots.map(x=>x.id),3);
  const credit=photo?.credit?`${e(photo.credit.artist)} · ${e(photo.credit.license)}`:photo?.kind==='upload'?'景区上传':'';
  const mood=geo?.season&&MOODS[geo.season];
  return `<button class="m3-close" id="m3-card-close" aria-label="关闭">${ic('x')}</button>
  ${photo?`<figure class="m3-cover"><img src="${e(webImageUrl(photo.url))}" alt="${e(s.name)}"><figcaption>${photo.kind==='real'?'实景摄影':'景区图片'}${credit?' · '+credit:''}</figcaption></figure>`:''}
  <div class="m3-card-body">
   <small class="m3-eyebrow">${e(geo?.scene||'景点')}</small><h2>${e(s.name)}</h2><p>${e(s.description||'')}</p>
   ${mood&&mood!==MOODS[currentMood]?`<button class="m3-season" data-mood-go="${geo.season}">${ic('sparkles')}换到「${mood.name}」时节看看</button>`:''}
   <div class="m3-card-actions">
    ${w?`<button class="m3-btn primary" id="m3-enter">${ic('box')}走进三维实景</button>`:`<a class="m3-btn primary" href="#spot?s=${encodeURIComponent(sid)}&id=${encodeURIComponent(s.id)}">${ic('images')}看实景照片</a>`}
    ${here?(stamps[s.id]?`<button class="m3-btn stamped" disabled>${ic('check')}已盖章</button>`:`<button class="m3-btn seal" id="m3-stamp">${ic('stamp')}盖章打卡</button>`):`<button class="m3-btn" id="m3-go">${ic('footprints')}走过去</button>`}
   </div>
   <div class="m3-guide-row">${s.narration?.text?`<button class="m3-guide-link" id="m3-listen">${ic('volume-2')}<span>听讲解</span></button>`:''}<a class="m3-guide-link" href="#spot?s=${encodeURIComponent(sid)}&id=${encodeURIComponent(s.id)}&guide=1">${ic('message-circle')}问问导游 · 照片与讲解</a></div>
   ${nb.length?`<div class="m3-near"><h3>顺路去</h3>${nb.map(n=>{const o=spots.find(x=>x.id===n.id);return `<button data-walk="${n.id}"><span>${e(o.name.split(' · ')[0])}</span><small>${compassName(n.bearing)} · ${n.boat?'游船':'步行'}约 ${n.minutes} 分钟</small>${ic('arrow-right')}</button>`;}).join('')}</div>`:''}
  </div>`;
 }
 function openCard(id){
  const s=spots.find(x=>x.id===id);if(!s)return;if(selected!==id)stopSpeaking();selected=id;const card=$('#m3-card');card.innerHTML=cardHTML(s);card.hidden=false;hydrate();bindSpeak($('#m3-listen'),s.narration?.text);
  $$('.m3-tag').forEach(t=>t.classList.toggle('active',t.dataset.spot===id));
  $('#m3-card-close').onclick=()=>{stopSpeaking();card.hidden=true;selected=null;$$('.m3-tag').forEach(t=>t.classList.remove('active'));};
  $('#m3-enter')&&($('#m3-enter').onclick=()=>enterWorld(s));
  $('#m3-go')&&($('#m3-go').onclick=()=>walkTo(...NODES[nodeOf(s)],s.id));
  $('#m3-stamp')&&($('#m3-stamp').onclick=()=>stamp(s));
  $$('[data-walk]').forEach(b=>b.onclick=()=>{const o=spots.find(x=>x.id===b.dataset.walk);openCard(o.id);walkTo(...NODES[nodeOf(o)],o.id);});
  $$('[data-mood-go]').forEach(b=>b.onclick=()=>setMood(b.dataset.moodGo));
 }
 function selectSpot(id,walk){
  const s=spots.find(x=>x.id===id);if(!s)return;openCard(id);
  const [x,z]=posOf(s);goal.target.set(x,0,z);goal.dist=Math.min(goal.dist,26);userAt=performance.now();follow=false;
  if(walk&&near!==id)walkTo(...NODES[nodeOf(s)],id);
 }
 function enterWorld(s){
  const [x,z]=posOf(s);persist();follow=false;goal.target.set(x,terrainHeight(x,z)+.4,z);goal.dist=3.5;goal.phi=1.28;ease=2.2;
  $('#m3-veil').classList.add('on');setTimeout(()=>{if(alive)location.hash=`#pilot?s=${encodeURIComponent(sid)}&id=${encodeURIComponent(s.id)}&from=map`;},1050);
 }
 function stamp(s){
  stamps=saveStamp(sid,s.id);updateCount();
  const fx=$('#m3-seal-fx');fx.innerHTML=sealSVG(s,true);fx.hidden=false;fx.classList.remove('play');void fx.offsetWidth;fx.classList.add('play');thunk();
  setTimeout(()=>{if(!alive)return;fx.hidden=true;$('#m3-tags').innerHTML=tagsHTML();bindTags();openCard(s.id);if(spots.every(x=>stamps[x.id]))setTimeout(()=>openBook(true),400);},1500);
 }
 const sealName=s=>s.name.split(' · ')[0].replace(/\s/g,'').slice(0,4);
 function sealSVG(s,big=false){
  const n=sealName(s),chars=[...n],cols=chars.length>2?2:1,rows=Math.ceil(chars.length/cols);
  const cells=chars.map((c,i)=>{const col=cols===2?(i<rows?1:0):0,row=cols===2?i%rows:i;return `<text x="${cols===2?(col?68:32):50}" y="${(100/(rows))*(row+.5)+ (rows===1?12:10)}" font-size="${rows>1?36:46}">${e(c)}</text>`;}).join('');
  return `<svg viewBox="0 0 100 100" class="m3-seal ${big?'big':''}" aria-label="${e(n)} 印"><rect x="5" y="5" width="90" height="90" rx="9"/><rect x="11" y="11" width="78" height="78" rx="5" class="inner"/>${cells}</svg>`;
 }
 function openBook(done=false){
  const b=$('#m3-book'),got=spots.filter(s=>stamps[s.id]).length;
  b.innerHTML=`<button class="m3-close" id="m3-book-close" aria-label="关闭">${ic('x')}</button><small class="m3-eyebrow">游园印章 · ${got}/${spots.length}</small><h2>${got===spots.length?'西湖胜景，一一集齐':'走到景点，盖下一枚印'}</h2><p>${got===spots.length?'六处风景都已亲自走到。把这份游园册带进行程，出发时就知道先去哪里。':'小人走到景点旁，卡片里会出现「盖章打卡」。'}</p><div class="m3-seals">${spots.map(s=>`<div class="${stamps[s.id]?'got':''}">${sealSVG(s)}<span>${e(s.name.split(' · ')[0])}</span><small>${stamps[s.id]?new Date(stamps[s.id]).toLocaleDateString('zh-CN',{month:'numeric',day:'numeric'})+' 已打卡':'未打卡'}</small></div>`).join('')}</div>`;
  b.hidden=false;b.classList.toggle('done',done||got===spots.length);hydrate();$('#m3-book-close').onclick=()=>{b.hidden=true;};
 }
 let audio;
 function thunk(){try{audio||=new AudioContext();const t=audio.currentTime,o=audio.createOscillator(),g=audio.createGain();o.type='triangle';o.frequency.setValueAtTime(140,t);o.frequency.exponentialRampToValueAtTime(48,t+.18);g.gain.setValueAtTime(.35,t);g.gain.exponentialRampToValueAtTime(.001,t+.3);o.connect(g).connect(audio.destination);o.start(t);o.stop(t+.32);}catch{}}

 let currentMood=saved?.mood&&MOODS[saved.mood]?saved.mood:'spring';
 function setMood(id){currentMood=id;world.setMood(id);$$('[data-mood]').forEach(b=>b.classList.toggle('active',b.dataset.mood===id));$('#m3').classList.toggle('m3-dark',MOODS[id].night>.6);if(selected)openCard(selected);persist();}
 const persist=()=>sessionStorage.setItem(SESSION,JSON.stringify({hero:[me.x,me.z],mood:currentMood}));

 // Input
 const ray=new T.Raycaster(),ndc=new T.Vector2();let drag=null;const pointers=new Map();
 const el=renderer.domElement;el.tabIndex=0;
 el.addEventListener('contextmenu',ev=>ev.preventDefault());
 el.addEventListener('pointerdown',ev=>{el.focus();el.setPointerCapture(ev.pointerId);pointers.set(ev.pointerId,[ev.clientX,ev.clientY]);drag={x:ev.clientX,y:ev.clientY,sx:ev.clientX,sy:ev.clientY,t:performance.now(),mode:ev.button===2||ev.shiftKey?'pan':'rotate',moved:false,pinch:null};if(pointers.size===2){const [a,b]=[...pointers.values()];drag.pinch=Math.hypot(a[0]-b[0],a[1]-b[1]);drag.mode='pinch';}});
 el.addEventListener('pointermove',ev=>{
  if(!drag)return;pointers.set(ev.pointerId,[ev.clientX,ev.clientY]);
  const dx=ev.clientX-drag.x,dy=ev.clientY-drag.y;drag.x=ev.clientX;drag.y=ev.clientY;
  if(Math.hypot(ev.clientX-drag.sx,ev.clientY-drag.sy)>5){drag.moved=true;markSeen();}
  if(!drag.moved)return;
  if(drag.mode==='pinch'&&pointers.size===2){const [a,b]=[...pointers.values()],d=Math.hypot(a[0]-b[0],a[1]-b[1]);goal.dist=Math.max(7,Math.min(75,goal.dist*drag.pinch/d));drag.pinch=d;return;}
  if(drag.mode==='rotate'){goal.theta-=dx*.0055;goal.phi=Math.max(.32,Math.min(1.3,goal.phi-dy*.004));}
  else{const k=goal.dist*.0016,f=new T.Vector3(Math.sin(goal.theta),0,Math.cos(goal.theta)),r=new T.Vector3(f.z,0,-f.x);goal.target.addScaledVector(r,-dx*k).addScaledVector(f,-dy*k);clampTarget(goal.target);follow=false;userAt=performance.now();}
 });
 const up=ev=>{pointers.delete(ev.pointerId);if(!drag)return;const click=!drag.moved&&performance.now()-drag.t<450&&drag.mode!=='pinch';drag=pointers.size?drag:null;if(click)pick(ev);};
 el.addEventListener('pointerup',up);el.addEventListener('pointercancel',ev=>{pointers.delete(ev.pointerId);drag=null;});
 el.addEventListener('wheel',ev=>{ev.preventDefault();goal.dist=Math.max(7,Math.min(75,goal.dist*(1+ev.deltaY*.0011)));markSeen();},{passive:false});
 function pick(ev){
  const r=el.getBoundingClientRect();ndc.set((ev.clientX-r.left)/r.width*2-1,-(ev.clientY-r.top)/r.height*2+1);ray.setFromCamera(ndc,camera);
  const lm=ray.intersectObjects(Object.values(world.spots).map(s=>s.object),true)[0];
  if(lm?.object.userData.spot&&spots.some(s=>s.id===lm.object.userData.spot))return selectSpot(lm.object.userData.spot,true);
  const hit=ray.intersectObjects([world.water,world.terrain],false)[0];if(!hit)return;
  let {x,z}=hit.point;if(hit.object===world.water&&landField(x,z)>0){const t=ray.intersectObject(world.terrain)[0];if(t)({x,z}=t.point);}
  ripple(x,z);walkTo(x,z);
 }
 const ripples=[];
 function ripple(x,z){const m=new T.Mesh(new T.RingGeometry(.1,.16,40),new T.MeshBasicMaterial({color:'#fffaf0',transparent:true,opacity:.9,depthWrite:false}));m.rotation.x=-Math.PI/2;m.position.set(x,Math.max(.03,terrainHeight(x,z))+.03,z);m.userData.t=0;scene.add(m);ripples.push(m);}
 const keyMap={w:'f',arrowup:'f',s:'b',arrowdown:'b',a:'l',arrowleft:'l',d:'r',arrowright:'r'};
 const kd=ev=>{if(ev.target.closest?.('input,textarea'))return;const k=keyMap[ev.key.toLowerCase()];if(k){keys.add(k);me.route=[];me.goal=null;drawRoute();follow=true;markSeen();ev.preventDefault();}
  if(ev.key.toLowerCase()==='e'&&near){const s=spots.find(x=>x.id===near);if(s&&!stamps[s.id])stamp(s);else openCard(near);}};
 const ku=ev=>{const k=keyMap[ev.key.toLowerCase()];if(k)keys.delete(k);};
 addEventListener('keydown',kd);addEventListener('keyup',ku);
 $('#m3-compass').onclick=()=>{goal.theta=0;goal.phi=.9;};
 $$('[data-mood]').forEach(b=>b.onclick=()=>setMood(b.dataset.mood));
 $('#m3-passport').onclick=()=>openBook();

 // Frame loop
 const clock=new T.Clock(),tmp=new T.Vector3(),offset=new T.Vector3(),aim=new T.Vector3();let shown=false,frames=0;
 function step(dt,t){
  // Free walking with the keyboard, relative to the camera.
  if(keys.size){
   const f=new T.Vector2(-Math.sin(rig.theta),-Math.cos(rig.theta)),r=new T.Vector2(-f.y,f.x),v=new T.Vector2();
   if(keys.has('f'))v.add(f);if(keys.has('b'))v.sub(f);if(keys.has('r'))v.add(r);if(keys.has('l'))v.sub(r);
   if(v.lengthSq()){v.normalize().multiplyScalar(dt*2.4);const nx=me.x+v.x,nz=me.z+v.y;
    if(walkable(nx,nz)){me.x=nx;me.z=nz;}else if(walkable(nx,me.z))me.x=nx;else if(walkable(me.x,nz))me.z=nz;
    me.heading=Math.atan2(v.x,v.y);me.moving=true;me.mode='walk';}
  }else if(me.route.length){
   const p=me.route[0],dx=p.x-me.x,dz=p.z-me.z,d=Math.hypot(dx,dz),sp=(p.mode==='boat'?3.6:2.6)*dt;me.mode=p.mode;
   if(d<=sp){me.x=p.x;me.z=p.z;me.route.shift();drawRoute();if(!me.route.length&&me.goal){const g=me.goal;me.goal=null;near=g;openCard(g);goal.dist=Math.min(goal.dist,18);}}
   else{me.x+=dx/d*sp;me.z+=dz/d*sp;me.heading=Math.atan2(dx,dz);}
   me.moving=true;
  }else me.moving=false;
  const boatNow=me.mode==='boat'&&landField(me.x,me.z)<0;
  const gy=boatNow?.02:Math.max(.05,groundHeight(me.x,me.z));
  hero.position.set(me.x,gy,me.z);
  let dh=me.heading-hero.rotation.y;dh=Math.atan2(Math.sin(dh),Math.cos(dh));hero.rotation.y+=dh*Math.min(1,dt*10);
  const {body,um,ring,raft}=hero.parts;raft.visible=boatNow;body.position.y=boatNow?.06:me.moving?Math.abs(Math.sin(t*13))*.035:0;body.rotation.z=me.moving&&!boatNow?Math.sin(t*13)*.07:0;um.rotation.z=Math.sin(t*2)*.05+(me.moving?.12:0);
  ring.scale.setScalar(1+Math.sin(t*3)*.08);ring.material.opacity=boatNow?0:.55+Math.sin(t*3)*.2;
  if(me.moving)persistThrottled();
  // Nearby spot
  const was=near;near=null;for(const s of spots){const [x,z]=NODES[nodeOf(s)]||posOf(s);if(Math.hypot(x-me.x,z-me.z)<1.1){near=s.id;break;}}
  if(was!==near){if(selected===was||selected===near)selected&&openCard(selected);}
  // Camera
  if(follow||performance.now()-userAt>6000){if(me.moving||follow){goal.target.lerp(tmp.set(me.x,gy*.5,me.z),Math.min(1,dt*2.2));follow=true;}}
  // With the card open on a wide screen, keep the focus left of it.
  const shift=!$('#m3-card').hidden&&stage.clientWidth>900?goal.dist*.16:0;offset.set(Math.cos(rig.theta),0,-Math.sin(rig.theta)).multiplyScalar(shift);
  const k=1-Math.exp(-dt*ease);rig.target.lerp(aim.copy(goal.target).add(offset),k);rig.dist+=(goal.dist-rig.dist)*k;rig.theta+=(goal.theta-rig.theta)*k;rig.phi+=(goal.phi-rig.phi)*k;
  if(ease<6)ease=Math.min(6,ease+dt*.9);
  placeCamera();
  if(world.night>.02){camera.updateMatrixWorld();const d=tmp.set(.8,.64,.5).unproject(camera).sub(camera.position).normalize();world.moon.position.copy(camera.position).addScaledVector(d,300);}
  tilt.uniforms.uAmount.value=Math.min(1.2,Math.max(.35,(rig.dist-6)/30));
  $('#m3-needle').style.transform=`rotate(${(rig.theta*180/Math.PI+180)%360}deg)`;
  for(let i=ripples.length-1;i>=0;i--){const m=ripples[i];m.userData.t+=dt;m.scale.setScalar(1+m.userData.t*5);m.material.opacity=.9-m.userData.t*1.4;if(m.userData.t>.65){scene.remove(m);m.geometry.dispose();ripples.splice(i,1);}}
  routeLine.material.dashOffset=-t*.8;
  positionTags();
 }
 let lastSave=0;const persistThrottled=()=>{const n=performance.now();if(n-lastSave>800){lastSave=n;persist();}};
 function positionTags(){
  const w=stage.clientWidth,h=stage.clientHeight,fade=Math.max(0,Math.min(1,(rig.dist-12)/10));
  placeEls.forEach((el,i)=>{const p=PLACE_LABELS[i],v=tmp.set(p.at[0],p.y,p.at[1]).project(camera),vis=v.z<1&&Math.abs(v.x)<1.05&&Math.abs(v.y)<1.05;el.style.opacity=vis?fade:0;el.style.transform=`translate(${(v.x*.5+.5)*w}px,${(-v.y*.5+.5)*h}px) translate(-50%,-50%)`;});
  for(const t of $$('.m3-tag')){
   const v=anchorOf(t.dataset.spot).project(camera),vis=v.z<1&&Math.abs(v.x)<1.1&&Math.abs(v.y)<1.1;t.style.opacity=vis?'':'0';t.style.pointerEvents=vis?'':'none';
   const sc=Math.max(.72,Math.min(1.12,30/rig.dist));t.style.transform=`translate(${(v.x*.5+.5)*w}px,${(-v.y*.5+.5)*h}px) translate(-50%,-100%) scale(${sc})`;
  }
  const mp=hero.position.clone().add(new T.Vector3(0,1.05,0)).project(camera),meEl=$('#m3-me');meEl.style.transform=`translate(${(mp.x*.5+.5)*w}px,${(-mp.y*.5+.5)*h}px)`;meEl.classList.toggle('show',rig.dist>24&&mp.z<1);
  const b=$('#m3-bubble');
  if(near&&!selected){const s=spots.find(x=>x.id===near),v=hero.position.clone().add(new T.Vector3(0,.9,0)).project(camera);b.hidden=false;b.innerHTML=`${stamps[near]?'已到 ':'到了 '}<b>${e(s.name.split(' · ')[0])}</b> <kbd>E</kbd> ${stamps[near]?'查看':'盖章'}`;b.style.transform=`translate(${(v.x*.5+.5)*w}px,${(-v.y*.5+.5)*h}px) translate(-50%,-100%)`;b.onclick=()=>openCard(near);}
  else b.hidden=true;
 }
 function loop(){
  if(!alive)return;frame=requestAnimationFrame(loop);
  const dt=Math.min(clock.getDelta(),.05),t=clock.elapsedTime;
  const t0=performance.now();world.update(t,dt,renderer);bloom.strength=.5+world.night*.55;const t1=performance.now();step(dt,t);const t2=performance.now();composer.render(dt);
  if(window.__m3)__m3.ms=[t1-t0,t2-t1,performance.now()-t2].map(x=>+x.toFixed(1));
  if(!shown&&++frames>2){shown=true;$('#m3-loading').classList.add('done');}
 }
 setMood(currentMood);
 loadScenic().catch(()=>null).then(ws=>{
  if(!alive)return;
  const p=ws?.scenics.find(x=>x.id===sid)?.published;spots=p?.spots||[];
  $('#m3-tags').innerHTML=tagsHTML();bindTags();updateCount();
  if(focusId&&spots.some(s=>s.id===focusId)){const [x,z]=posOf(spots.find(s=>s.id===focusId));goal.target.set(x,0,z);goal.dist=20;goal.phi=.95;near=focusId;setTimeout(()=>alive&&openCard(focusId),1600);}
 });
 if(params.get('debug'))window.__m3={camera,world,renderer,scene,composer,bloom,tilt,goal,rig,me,setMood,walkTo,selectSpot,get near(){return near;},get spots(){return spots;}};
 loop();
 return()=>{alive=false;stopSpeaking();cancelAnimationFrame(frame);ro.disconnect();removeEventListener('keydown',kd);removeEventListener('keyup',ku);persist();
  scene.traverse(o=>{o.geometry?.dispose();const m=o.material;(Array.isArray(m)?m:m?[m]:[]).forEach(x=>{x.map?.dispose();x.dispose();});});
  composer.dispose?.();renderer.dispose();renderer.forceContextLoss();audio?.close();};
}
