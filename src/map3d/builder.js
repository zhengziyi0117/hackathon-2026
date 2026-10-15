// Studio "AI map builder": watch the map agent edit the 3D map batch by batch, steer it, step back, adopt into the draft.
// The agent runs in the local server (pi RPC); every batch arrives as {changes, pkg} and is animated here.
import * as T from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {escapeHTML as e} from '../core.js';
import {createWorld} from './scene.js';
import {createGeography} from './geography.js';
import {styleFor,checkMapPackage} from './packages.js';

const ic=n=>`<i data-lucide="${n}"></i>`;
const TOOL_LABEL={inspect_map:'查看地图',check_point:'检查位置',apply_ops:'修改地图'};
const IDEAS=['把各景点的模型换成更贴合名称的造型','在水边加一座观景亭，连上步行小路','补几处山名和水面的地名标注'];
const easeOut=t=>1-(1-t)**3,easeBack=t=>1+2.7*(t-1)**3+1.7*(t-1)**2;
const post=async(url,data)=>{const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data||{})});const out=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(Error(out.error||'请求失败'),{status:r.status});return out;};

// pkg: the draft (or bundled) map package; spots: draft spots; ready: whether /api/map-agent is available.
export function mountMapBuilder({pkg:startPkg,spots,ready,intro:note='',hydrate,toast,onAdopt,onClose}){
 const spotIds=spots.map(s=>s.id),spotNames=Object.fromEntries(spots.map(s=>[s.id,s.name]));
 let pkg=structuredClone(startPkg),steps=[{summary:note?'自动生成的地图':'起点：当前草稿',pkg,changes:[]}],runId=null,source=null,busy=false,alive=true,frame,bubble=null,pointer=null;
 const host=document.createElement('div');host.className='mb';host.setAttribute('role','dialog');host.setAttribute('aria-modal','true');host.setAttribute('aria-label','AI 搭建三维地图');
 host.innerHTML=`<div class="mb-stage" id="mb-stage"></div><div class="mb-tags" id="mb-tags"></div>
 <div class="mb-hud"><span class="mb-dot" id="mb-dot"></span><b id="mb-status">正在铺开地图…</b><label class="mb-toggle"><input type="checkbox" id="mb-net" checked>路网</label></div>
 <aside class="mb-side">
  <header><div><small>MAP AGENT</small><h2>AI 搭建 · ${e(startPkg.manifest.name)}</h2></div><button class="mb-icon" id="mb-close" aria-label="关闭">${ic('x')}</button></header>
  <ol class="mb-steps" id="mb-steps" aria-label="修改步骤"></ol>
  <div class="mb-log" id="mb-log" aria-live="polite">${note?`<div class="mb-msg done">${ic('sparkles')} ${e(note)}</div>`:''}${ready?`<p class="mb-hint">告诉 Agent 想怎么改这张地图。它会一批一批修改，每批都先过契约与空间校验；你可以随时插话改方向、暂停，或在上方步骤里回到任意一步。点地图上的模型或地面，可以把位置带进对话。</p><div class="mb-ideas">${IDEAS.map(t=>`<button data-idea="${e(t)}">${e(t)}</button>`).join('')}</div>`:`<p class="mb-hint">${ic('plug-zap')} 需要本机服务和 pi：安装并登录 pi 后运行 npm start。地图 Agent 使用 pi 当前配置的模型。</p>`}</div>
  <div class="mb-pointer" id="mb-pointer" hidden></div>
  <form class="mb-input" id="mb-form"><textarea id="mb-text" rows="2" maxlength="2000" placeholder="${ready?'例如：在湖边加一座塔，用步行小路连到最近的景点':'本机服务未就绪'}" ${ready?'':'disabled'}></textarea>
   <div class="mb-actions"><button type="button" class="mb-btn" id="mb-stop" disabled>${ic('pause')}暂停</button><button type="button" class="mb-btn" id="mb-adopt" disabled>${ic('check')}采用到草稿</button><button class="mb-btn primary" id="mb-send" ${ready?'':'disabled'}>${ic('send')}发送</button></div></form>
 </aside>`;
 document.body.append(host);hydrate();
 const $=s=>host.querySelector(s),stage=$('#mb-stage');

 // Renderer, same look as the visitor map (bloom only; no tilt-shift so details stay readable while editing).
 let renderer;try{renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'});}catch{host.remove();toast('当前浏览器未开启三维渲染');onClose?.();return {dispose(){}};}
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.outputColorSpace=T.SRGBColorSpace;stage.append(renderer.domElement);
 const scene=new T.Scene(),rules=startPkg.interaction,camera=new T.PerspectiveCamera(rules.camera.fov,1,startPkg.geography.architecture?.12:.5,900);
 const composer=new EffectComposer(renderer),bloom=new UnrealBloomPass(new T.Vector2(1,1),.6,.5,.85);composer.addPass(new RenderPass(scene,camera));composer.addPass(bloom);composer.addPass(new OutputPass());
 const resize=()=>{const w=stage.clientWidth,h=stage.clientHeight;if(!w||!h)return;renderer.setSize(w,h);composer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();};
 const ro=new ResizeObserver(resize);ro.observe(stage);resize();
 const pose=c=>({target:new T.Vector3(...c.target),dist:c.distance,theta:c.theta,phi:c.phi}),rig=pose(rules.camera.intro),goal=pose(rules.camera.home);
 const placeCamera=()=>{const s=Math.sin(rig.phi);camera.position.set(rig.target.x+s*Math.sin(rig.theta)*rig.dist,rig.target.y+Math.cos(rig.phi)*rig.dist,rig.target.z+s*Math.cos(rig.theta)*rig.dist);camera.lookAt(rig.target);};

 let world,geo,style=styleFor(startPkg,startPkg.manifest.defaultStyle),net=null;
 const fx=new T.Group();scene.add(fx);
 const groundY=(x,z)=>Math.max(.06,world.groundHeight(x,z));
 function build(next){
  world?.dispose();geo=createGeography(next.geography,next.interaction);world=createWorld(scene,{geo,layout:next.layout,style});
  world.setMood(next.interaction.defaultMood,true);renderer.toneMappingExposure=style.moods[next.interaction.defaultMood].exposure;drawNetwork();
 }
 function drawNetwork(){
  if(net){net.geometry.dispose();net.material.dispose();net.removeFromParent();}
  const pts=[],N=geo.NODES;for(const ed of geo.EDGES)for(const id of [ed.a,ed.b]){const [x,z]=N[id];pts.push(x,groundY(x,z)+.05,z);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pts,3));
  net=new T.LineSegments(g,new T.LineBasicMaterial({color:'#fff4d6',transparent:true,opacity:.75,depthTest:false}));net.renderOrder=6;net.visible=$('#mb-net').checked;scene.add(net);
 }

 // Effects: each is {t, dur, step(k), done()} advanced in the frame loop.
 const effects=[];
 const play=(dur,step,done,delay=0)=>effects.push({t:-delay,dur,step,done});
 const glow=color=>new T.MeshBasicMaterial({color,transparent:true,depthWrite:false,blending:T.AdditiveBlending,side:T.DoubleSide});
 function ring([x,z],color='#7ff0ff',size=2.2,delay=0){
  const m=new T.Mesh(new T.RingGeometry(.86,1,64),glow(color));m.rotation.x=-Math.PI/2;m.position.set(x,groundY(x,z)+.04,z);m.scale.setScalar(.01);m.visible=!delay;fx.add(m);
  play(1.1,k=>{m.visible=true;m.scale.setScalar(.1+size*easeOut(k));m.material.opacity=1-k;},()=>{m.geometry.dispose();m.material.dispose();m.removeFromParent();},delay);
 }
 function beam([x,z],color='#7ff0ff',height=3.2,delay=0){
  const m=new T.Mesh(new T.CylinderGeometry(.035,.12,height,10,1,true).translate(0,height/2,0),glow(color));m.position.set(x,groundY(x,z),z);m.scale.y=.01;m.visible=!delay;fx.add(m);
  play(1.4,k=>{m.visible=true;m.scale.y=Math.min(1,k*3);m.material.opacity=k<.6?.9:.9*(1-(k-.6)/.4);},()=>{m.geometry.dispose();m.material.dispose();m.removeFromParent();},delay);
 }
 function trail(a,b,color='#ffd36b',delay=0){
  const A=new T.Vector3(a[0],groundY(...a)+.07,a[1]),B=new T.Vector3(b[0],groundY(...b)+.07,b[1]),len=A.distanceTo(B)||.01;
  const m=new T.Mesh(new T.CylinderGeometry(.045,.045,1,8).translate(0,.5,0).rotateX(Math.PI/2),glow(color));m.position.copy(A);m.lookAt(B);m.scale.set(1,1,.001);m.renderOrder=7;fx.add(m);
  play(1.8,k=>{m.scale.z=len*Math.min(1,k*2.2);m.material.opacity=k<.7?1:1-(k-.7)/.3;},()=>{m.geometry.dispose();m.material.dispose();m.removeFromParent();},delay);
 }
 function popIn(o,delay=0){
  const s=o.scale.x,y=o.position.y;o.scale.setScalar(.001);
  play(.9,k=>{o.scale.setScalar(Math.max(.001,s*easeBack(k)));o.position.y=y+(1-easeOut(k))*1.6;},()=>{o.scale.setScalar(s);o.position.y=y;},delay);
 }
 function glide(o,from){const to=o.position.clone(),a=new T.Vector3(from[0],to.y,from[1]);o.position.copy(a);play(1,k=>o.position.lerpVectors(a,to,easeOut(k)));}
 function ghost(box){
  const size=box.getSize(new T.Vector3()),m=new T.Mesh(new T.BoxGeometry(size.x||.3,size.y||.3,size.z||.3),new T.MeshBasicMaterial({color:'#ff7a6b',wireframe:true,transparent:true}));
  box.getCenter(m.position);fx.add(m);play(1.2,k=>{m.scale.setScalar(1-k*.6);m.position.y-=.004;m.material.opacity=1-k;},()=>{m.geometry.dispose();m.material.dispose();m.removeFromParent();});
 }
 const objectOf=id=>{let found=null;scene.traverse(o=>{if(!found&&o.name===id)found=o;});return found;};

 // Rebuild from a new package and animate what changed. Batched decor (v2 walls etc.) has no own object; it gets a ring.
 function show(next,changes){
  const boxes={};for(const c of changes)if(c.kind==='landmark'&&c.action==='remove'){const o=objectOf(c.id);if(o)boxes[c.id]=new T.Box3().setFromObject(o);}
  build(next);
  const points=[];let i=0;
  for(const c of changes){
   const d=i++*.12;if(c.at)points.push(c.at);
   if(c.kind==='landmark'){
    const o=c.action!=='remove'&&objectOf(c.id);
    if(c.action==='add'){if(o)popIn(o,d);ring(c.at,'#7ff0ff',2.4,d);beam(c.at,'#9ff7ff',3.6,d);}
    else if(c.action==='update'){if(o&&c.from)glide(o,c.from);ring(c.at,'#ffd36b',1.8,d);}
    else{if(boxes[c.id])ghost(boxes[c.id]);ring(c.at,'#ff7a6b',1.6,d);}
   }else if(c.kind==='edge'){points.push(...c.points);if(c.action==='add')trail(...c.points,c.mode==='boat'?'#8fc8ff':'#ffd36b',d);else trail(...c.points,'#ff7a6b',d);}
   else ring(c.at,c.action==='remove'?'#ff7a6b':c.kind==='spot'?'#ffb3c7':'#b6ffcf',1.4,d);
  }
  if(points.length)focusOn(points);
 }
 function focusOn(points){
  const xs=points.map(p=>p[0]),zs=points.map(p=>p[1]),cx=(Math.min(...xs)+Math.max(...xs))/2,cz=(Math.min(...zs)+Math.max(...zs))/2,span=Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...zs)-Math.min(...zs));
  goal.target.set(cx,0,cz);goal.dist=Math.max(rules.camera.minDistance,Math.min(rules.camera.maxDistance,18+span*2.4));// keep context around a single-point change
 }
 // Opening: named landmarks rise in order of distance from the centre, while the road network is drawn outwards.
 function intro(){
  const named=Object.values(world.spots).map(s=>s.object),c=goal.target;
  named.sort((a,b)=>a.position.distanceTo(c)-b.position.distanceTo(c)).forEach((o,i)=>{popIn(o,.6+i*.18);ring([o.position.x,o.position.z],'#7ff0ff',2,.6+i*.18);});
  const total=net.geometry.attributes.position.count;net.geometry.setDrawRange(0,0);play(2.6,k=>net.geometry.setDrawRange(0,Math.floor(total*easeOut(k)/2)*2),()=>net.geometry.setDrawRange(0,Infinity),.3);
  status('地图已就绪',false);
 }
 build(pkg);intro();

 // Spot / place labels as light HTML tags over the canvas.
 const labelOf=()=>[...Object.entries(geo.SPOT_GEO).map(([id,g])=>({text:(spotNames[id]||id).split(' · ')[0],at:g.label,spot:true})),...pkg.layout.labels.map(l=>({text:l.text,at:l.at}))];
 let labels=[];
 function drawLabels(){labels=labelOf();$('#mb-tags').innerHTML=labels.map(l=>`<span class="mb-tag ${l.spot?'spot':''}">${e(l.text)}</span>`).join('');}
 drawLabels();

 // Camera input; a click without dragging picks a model or a ground point and attaches it to the next message.
 const ray=new T.Raycaster(),ndc=new T.Vector2(),el=renderer.domElement;let drag=null;
 el.addEventListener('contextmenu',ev=>ev.preventDefault());
 el.addEventListener('pointerdown',ev=>{el.setPointerCapture(ev.pointerId);drag={x:ev.clientX,y:ev.clientY,sx:ev.clientX,sy:ev.clientY,pan:ev.button===2||ev.shiftKey};});
 el.addEventListener('pointermove',ev=>{if(!drag)return;const dx=ev.clientX-drag.x,dy=ev.clientY-drag.y;drag.x=ev.clientX;drag.y=ev.clientY;
  if(drag.pan){const k=goal.dist*.0016,f=new T.Vector3(Math.sin(goal.theta),0,Math.cos(goal.theta)),r=new T.Vector3(f.z,0,-f.x);goal.target.addScaledVector(r,-dx*k).addScaledVector(f,-dy*k);}
  else{goal.theta-=dx*.0055;goal.phi=Math.max(rules.camera.minPhi,Math.min(rules.camera.maxPhi,goal.phi-dy*.004));}});
 el.addEventListener('pointerup',ev=>{const d=drag;drag=null;if(d&&Math.hypot(ev.clientX-d.sx,ev.clientY-d.sy)<5)pick(ev);});
 el.addEventListener('wheel',ev=>{ev.preventDefault();goal.dist=Math.max(rules.camera.minDistance,Math.min(rules.camera.maxDistance,goal.dist*(1+ev.deltaY*.0011)));},{passive:false});
 function pick(ev){
  const r=el.getBoundingClientRect();ndc.set((ev.clientX-r.left)/r.width*2-1,-(ev.clientY-r.top)/r.height*2+1);ray.setFromCamera(ndc,camera);
  const hit=ray.intersectObjects([world.terrain,world.water,...Object.values(world.spots).map(s=>s.object)],true)[0];if(!hit)return;
  let o=hit.object;while(o&&!pkg.layout.landmarks.some(m=>m.id===o.name))o=o.parent;
  const at=[+hit.point.x.toFixed(2),+hit.point.z.toFixed(2)],m=o&&pkg.layout.landmarks.find(x=>x.id===o.name);
  pointer=m?{text:`模型 ${m.id}（${m.model}${m.spotId?'，景点 '+(spotNames[m.spotId]||m.spotId):''}）`,at:m.at}:{text:`地面 [${at.join(', ')}]${geo.landField(...at)<0?'（水面）':''}`,at};
  $('#mb-pointer').hidden=false;$('#mb-pointer').innerHTML=`${ic('crosshair')}<span>${e(pointer.text)}</span><button type="button" aria-label="取消指向">${ic('x')}</button>`;hydrate();
  $('#mb-pointer button').onclick=()=>{pointer=null;$('#mb-pointer').hidden=true;};
  ring(pointer.at,'#ffffff',1.2);$('#mb-text').focus();
 }

 // Conversation and steps.
 const log=$('#mb-log');
 const scroll=()=>{log.scrollTop=log.scrollHeight;};
 function add(cls,html){const p=document.createElement('div');p.className='mb-msg '+cls;p.innerHTML=html;log.append(p);scroll();return p;}
 function status(text,on=busy){$('#mb-status').textContent=text;$('#mb-dot').classList.toggle('on',on);}
 function setBusy(v){busy=v;$('#mb-stop').disabled=!v;$('#mb-send').innerHTML=`${ic(v?'corner-down-right':'send')}${v?'插话':'发送'}`;hydrate();status(v?'Agent 正在工作…':'等待你的指示',v);}
 function drawSteps(){
  $('#mb-steps').innerHTML=steps.map((s,i)=>`<li class="${i===steps.length-1?'current':''}"><button data-step="${i}" ${i===steps.length-1?'aria-current="step" disabled':''} title="${i===steps.length-1?'当前':'回到这一步'}"><b>${i}</b><span>${e(s.summary)}</span>${i<steps.length-1?ic('undo-2'):''}</button></li>`).join('');
  $('#mb-adopt').disabled=steps.length<2;hydrate();
  host.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>revert(+b.dataset.step));
  $('#mb-steps').lastElementChild?.scrollIntoView({block:'nearest'});
 }
 drawSteps();
 async function revert(i){
  const target=steps[i];if(!target)return;
  steps=steps.slice(0,i+1);pkg=structuredClone(target.pkg);build(pkg);drawLabels();drawSteps();ring([goal.target.x,goal.target.z],'#ffd36b',14);
  add('note',`${ic('undo-2')} 回到第 ${i} 步：${e(target.summary)}`);
  if(runId)await post(`/api/map-agent/${runId}/state`,{pkg,reason:`回到了第 ${i} 步（${target.summary}），之后的修改已撤销`}).catch(err=>toast(err.message));
 }
 function onEvent(ev){
  if(ev.type==='message'){bubble=null;return;}
  if(ev.type==='text'){if(!bubble){bubble=add('ai','');bubble.textContent='';}bubble.textContent+=ev.delta;scroll();return;}
  bubble=null;
  if(ev.type==='busy')return setBusy(ev.busy);
  if(ev.type==='user')return add('me',`${ev.steer?`<small>${ic('corner-down-right')} 插话</small>`:''}${e(ev.message)}`);
  if(ev.type==='notice')return add('note',e(ev.message));
  if(ev.type==='error')return add('err',`${ic('triangle-alert')} ${e(ev.message)}`);
  if(ev.type==='closed'){runId=null;return add('note','Agent 会话已结束，再发消息会从当前地图重新开始');}
  if(ev.type==='tool'){
   const a=ev.args||{};
   if(ev.name==='check_point')(a.points||[]).forEach((p,i)=>beam(p,'#7ff0ff',2.4,i*.08));
   if(ev.name==='inspect_map'&&Array.isArray(a.center))ring(a.center,'#7ff0ff',(a.radius||6)*1.1);
   status(ev.name==='apply_ops'?`正在修改：${a.summary||''}`:`${TOOL_LABEL[ev.name]||ev.name}…`,true);
   if(ev.name!=='apply_ops')add('tool',`${ic(ev.name==='check_point'?'scan-search':'map')} ${TOOL_LABEL[ev.name]||e(ev.name)}${a.section?' · '+e(a.section):''}${a.points?' · '+a.points.length+' 个点':''}`);
   return;
  }
  if(ev.type==='tool_end'&&ev.name==='apply_ops'){
   if(ev.rejected){add('reject',`${ic('shield-x')} 校验未通过，已回滚：${e(ev.summary||'')}<small>${e((ev.errors||[])[0]||'')}</small>`);status('校验拦下了一批修改，Agent 正在修正',true);return;}
   if(!ev.pkg)return;
   pkg=ev.pkg;steps.push({summary:ev.summary||`版本 ${ev.version}`,pkg,changes:ev.changes||[]});
   show(pkg,ev.changes||[]);drawLabels();drawSteps();
   add('done',`${ic('sparkles')} 第 ${steps.length-1} 步 · ${e(ev.summary||'')} <small>${(ev.changes||[]).length} 项改动</small>`);
  }
 }
 function listen(id){
  source?.close();source=new EventSource(`/api/map-agent/${id}/events`);
  source.onmessage=m=>{if(!alive)return;try{onEvent(JSON.parse(m.data));}catch(err){console.warn(err);}};
 }
 async function send(text){
  const extra=pointer?`\n（用户指向：${pointer.text}，坐标 [${pointer.at.join(', ')}]）`:'';
  const message=text+extra;
  if(runId){try{await post(`/api/map-agent/${runId}/message`,{message});}catch(err){if(err.status!==404)throw err;runId=null;}}
  if(!runId){log.querySelector('.mb-hint')?.remove();log.querySelector('.mb-ideas')?.remove();const {id}=await post('/api/map-agent',{pkg,spotIds,spotNames,prompt:message});runId=id;listen(id);add('me',e(message));}
  pointer=null;$('#mb-pointer').hidden=true;
 }
 $('#mb-form').onsubmit=async ev=>{ev.preventDefault();const t=$('#mb-text'),text=t.value.trim();if(!text)return;t.value='';try{await send(text);}catch(err){toast(err.message);t.value=text;}};
 $('#mb-text').addEventListener('keydown',ev=>{if(ev.key==='Enter'&&!ev.shiftKey&&!ev.isComposing){ev.preventDefault();$('#mb-form').requestSubmit();}});
 host.querySelectorAll('[data-idea]').forEach(b=>b.onclick=()=>{$('#mb-text').value=b.dataset.idea;$('#mb-text').focus();});
 $('#mb-stop').onclick=()=>runId&&post(`/api/map-agent/${runId}/stop`).catch(err=>toast(err.message));
 $('#mb-net').onchange=ev=>{net.visible=ev.target.checked;};
 $('#mb-adopt').onclick=async()=>{
  const errors=checkMapPackage(pkg,spotIds);if(errors.length)return toast('地图包未通过校验：'+errors[0]);
  try{await onAdopt(structuredClone(pkg));steps=[{summary:'已采用到草稿',pkg,changes:[]}];drawSteps();add('note',`${ic('check')} 已采用到草稿，发布后游客可见`);}catch(err){toast(err.message);}
 };
 const close=()=>{if(steps.length>1&&!confirm('还有没采用到草稿的修改，确定关闭吗？'))return;dispose();onClose?.();};
 $('#mb-close').onclick=close;
 const esc=ev=>{if(ev.key==='Escape'&&!ev.target.closest?.('textarea'))close();};addEventListener('keydown',esc);

 const clock=new T.Clock(),tmp=new T.Vector3();
 const sweep=new T.Mesh(new T.RingGeometry(.94,1,96),glow('#7ff0ff'));sweep.rotation.x=-Math.PI/2;sweep.material.opacity=0;scene.add(sweep);
 function loop(){
  if(!alive)return;frame=requestAnimationFrame(loop);
  const dt=Math.min(clock.getDelta(),.05),t=clock.elapsedTime;world.update(t,dt,renderer);
  for(let i=effects.length-1;i>=0;i--){const f=effects[i];f.t+=dt;if(f.t<0)continue;const k=Math.min(1,f.t/f.dur);f.step(k);if(k>=1){f.done?.();effects.splice(i,1);}}
  // While the agent thinks, a radar sweep pulses around the current focus.
  const p=(t%2.4)/2.4;sweep.position.set(goal.target.x,.1,goal.target.z);sweep.scale.setScalar(.5+p*Math.min(14,goal.dist*.35));sweep.material.opacity+=((busy?.55*(1-p):0)-sweep.material.opacity)*Math.min(1,dt*6);
  const k=1-Math.exp(-dt*2.4);rig.target.lerp(goal.target,k);rig.dist+=(goal.dist-rig.dist)*k;rig.theta+=(goal.theta-rig.theta)*k;rig.phi+=(goal.phi-rig.phi)*k;placeCamera();
  const w=stage.clientWidth,h=stage.clientHeight,tags=$('#mb-tags').children;
  labels.forEach((l,i)=>{const v=tmp.set(l.at[0],groundY(...l.at)+(l.spot?1.1:.5),l.at[1]).project(camera),el=tags[i];if(!el)return;el.style.opacity=v.z<1&&Math.abs(v.x)<1.05&&Math.abs(v.y)<1.05?'':'0';el.style.transform=`translate(${(v.x*.5+.5)*w}px,${(-v.y*.5+.5)*h}px) translate(-50%,-100%)`;});
  composer.render(dt);
 }
 loop();
 function dispose(){
  if(!alive)return;alive=false;cancelAnimationFrame(frame);ro.disconnect();removeEventListener('keydown',esc);source?.close();
  if(runId)fetch(`/api/map-agent/${runId}/close`,{method:'POST',headers:{'content-type':'application/json'},body:'{}',keepalive:true}).catch(()=>{});
  world.dispose();scene.traverse(o=>{o.geometry?.dispose();[o.material].flat().filter(Boolean).forEach(m=>m.dispose());});composer.dispose?.();renderer.dispose();renderer.forceContextLoss();host.remove();
 }
 return {dispose};
}
