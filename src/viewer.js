import * as T from 'three';
import {navigationStep,navigationDistance,clampToBounds} from './navigation.js';
// Walk-only Gaussian Splat viewer for generated scenic worlds. config.bounds is read on every move so callers can change it live.
// mode 'first' flies the camera (studio calibration); mode 'third' walks an avatar on the ground (y=0 after ground_plane_offset)
// with a follow camera. Bounds clamp the avatar's feet, so the camera may sit a little outside the box behind it.
export function createViewer(container,{onStatus,onPosition,onFrame,onMode,onInteract,splatURL,splatConfig:config,mode:startMode='first',avatar=null}){
  let renderer;
  try{renderer=new T.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});}
  catch{const box=document.createElement('div'),h=document.createElement('h3'),p=document.createElement('p');box.className='viewer-fallback';h.textContent='当前浏览器未启用三维渲染';p.textContent='可尝试 Chrome 或开启硬件加速。';box.append(h,p);container.prepend(box);onStatus?.('error');return {reset(){},move(){},setMove(){},look(){},setMode(){},walkTo(){},add(){},dispose(){}};}
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.NoToneMapping;
  container.prepend(renderer.domElement);renderer.domElement.tabIndex=0;
  const label=()=>renderer.domElement.setAttribute('aria-label',mode==='third'?'由照片生成的三维景点，第三人称漫步。拖动转视角，WASD 或方向键行走，Shift 跑，F 与导游对话或进入传送门，V 切换第一人称。':'由照片生成的三维景点。拖动环顾，WASD 或方向键移动，Shift 加速，Q 下降、E 上升。');
  const scene=new T.Scene();scene.background=new T.Color('#d6e5dc');
  // Splats ignore lights; these only shade the avatar, guide and portals.
  const sun=new T.DirectionalLight('#fff1dc',2.2);sun.position.set(3,6,2);scene.add(new T.HemisphereLight('#e8f2ff','#7d8a64',1.4),sun);
  const camera=new T.PerspectiveCamera(65,1,.05,600);camera.rotation.order='YXZ';
  let mode=startMode==='third'&&avatar?'third':'first',homeRot,anim=null,dist=3.2,walk=null;
  const feet=new T.Vector3(),tmp=new T.Vector3();
  if(avatar)scene.add(avatar);
  const groundHome=()=>[config.home[0],0,config.home[2]];
  // Follow camera: behind and above the head along the view direction, never below the ground.
  function follow(){
    const head=tmp.set(feet.x,1.45,feet.z),cp=Math.cos(camera.rotation.x);
    camera.position.set(head.x+Math.sin(camera.rotation.y)*cp*dist,Math.max(.25,head.y-Math.sin(camera.rotation.x)*dist),head.z+Math.cos(camera.rotation.y)*cp*dist);
  }
  const home=()=>{
    camera.position.set(...config.home);camera.lookAt(...config.target);homeRot=camera.rotation.clone();
    if(mode==='third'){
      // Stand a little ahead of the capture point so the follow camera sits near where the photo was taken.
      const f=navigationStep(groundHome(),[config.target[0]-config.home[0],0,config.target[2]-config.home[2]],'forward',Math.min(1.2,dist*.45));
      feet.fromArray(clampToBounds(f,groundHome(),config.bounds));feet.y=0;camera.rotation.x=-.2;avatar.rotation.y=camera.rotation.y+Math.PI;follow();
    }
  };
  function setMode(next){
    if(next==='third'&&!avatar)next='first';
    if(next===mode)return;
    walk=null;anim=null;
    if(next==='third'){feet.set(camera.position.x,0,camera.position.z);feet.fromArray(clampToBounds(feet.toArray(),groundHome(),config.bounds));feet.y=0;camera.rotation.x=T.MathUtils.clamp(camera.rotation.x,-.9,.35);}
    else camera.position.fromArray(clampToBounds([feet.x,config.home[1],feet.z],config.home,config.bounds));
    mode=next;if(avatar)avatar.visible=mode==='third';if(mode==='third')follow();label();onMode?.(mode);
  }
  if(avatar)avatar.visible=mode==='third';
  home();label();
  const keyDirections={ArrowUp:'forward',ArrowDown:'back',ArrowLeft:'left',ArrowRight:'right',w:'forward',s:'back',a:'left',d:'right',q:'down',e:'up'};
  const held=new Set(),heldMoves=new Set();let fast=false,dragPoint=null,atEdge=false,splat=null,closed=false,frame,lastPositionUpdate=0,moving=false;
  function move(direction,distance){
    if(!splat)return;
    const d=new T.Vector3();camera.getWorldDirection(d);
    if(mode==='third'){
      if(direction==='up'||direction==='down')return;
      const next=navigationStep(feet.toArray(),d.toArray(),direction,distance),bounded=clampToBounds(next,groundHome(),config.bounds);
      atEdge=bounded.some((v,i)=>v!==next[i]);
      const dx=bounded[0]-feet.x,dz=bounded[2]-feet.z;if(Math.hypot(dx,dz)>1e-5){feet.set(bounded[0],0,bounded[2]);turn(Math.atan2(dx,dz),.35);moving=true;}
      return;
    }
    const next=navigationStep(camera.position.toArray(),d.toArray(),direction,distance),bounded=clampToBounds(next,config.home,config.bounds);
    atEdge=bounded.some((v,i)=>v!==next[i]);camera.position.fromArray(bounded);
  }
  const turn=(heading,k)=>{let dh=heading-avatar.rotation.y;dh=Math.atan2(Math.sin(dh),Math.cos(dh));avatar.rotation.y+=dh*k;};
  const onDown=e=>{anim=null;dragPoint=[e.clientX,e.clientY];renderer.domElement.focus();renderer.domElement.setPointerCapture(e.pointerId);};
  const onMove=e=>{if(!dragPoint)return;const [lo,hi]=mode==='third'?[-.9,.35]:[-1.3,1.3];camera.rotation.y-=(e.clientX-dragPoint[0])*.004;camera.rotation.x=T.MathUtils.clamp(camera.rotation.x-(e.clientY-dragPoint[1])*.004,lo,hi);dragPoint=[e.clientX,e.clientY];};
  const release=()=>{dragPoint=null;};
  const keyOf=e=>e.key.length===1?e.key.toLowerCase():e.key;
  const key=e=>{const k=keyOf(e);if(k==='Shift'){fast=true;return;}if(k==='v'){setMode(mode==='third'?'first':'third');return;}if(k==='f'){e.preventDefault();onInteract?.();return;}if(keyDirections[k]){e.preventDefault();held.add(k);walk=null;}};
  const keyUp=e=>{const k=keyOf(e);held.delete(k);if(k==='Shift')fast=false;};
  const clearKeys=()=>{held.clear();heldMoves.clear();fast=false;};
  const wheel=e=>{e.preventDefault();if(mode==='third'){dist=T.MathUtils.clamp(dist+e.deltaY*.004,1.4,5);return;}move(e.deltaY>0?'forward':'back',Math.min(2,Math.max(.12,Math.abs(e.deltaY)*.008)));};
  const el=renderer.domElement;
  el.addEventListener('pointerdown',onDown);el.addEventListener('pointermove',onMove);el.addEventListener('pointerup',release);el.addEventListener('pointercancel',release);
  el.addEventListener('keydown',key);el.addEventListener('blur',()=>{held.clear();fast=false;});el.addEventListener('wheel',wheel,{passive:false});
  window.addEventListener('keyup',keyUp);window.addEventListener('blur',clearKeys);
  const observer=new ResizeObserver(()=>{const w=container.clientWidth,h=container.clientHeight;if(!w||!h)return;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();});observer.observe(container);
  const clock=new T.Clock(),actors=new Set();
  (function render(){
    if(closed)return;frame=requestAnimationFrame(render);
    const delta=Math.min(clock.getDelta(),.05),time=clock.elapsedTime;
    const directions=new Set([...held].map(k=>keyDirections[k]).concat([...heldMoves]));moving=false;
    if(directions.size)walk=null;
    for(const direction of directions)move(direction,delta*(mode==='third'?(fast?4:1.8):(fast?9:3))/Math.sqrt(directions.size));
    if(walk&&mode==='third'&&splat){
      // Auto-walk toward a portal or the guide; arrives when close or when the roaming edge stops progress.
      const dx=walk.to[0]-feet.x,dz=walk.to[2]-feet.z,d=Math.hypot(dx,dz),before=feet.clone();
      if(d<walk.stop){const done=walk.done;walk=null;done?.();}
      else{
        const heading=Math.atan2(dx,dz),step=Math.min(d,delta*2);
        feet.fromArray(clampToBounds([feet.x+dx/d*step,0,feet.z+dz/d*step],groundHome(),config.bounds));feet.y=0;turn(heading,.2);moving=true;
        let dy=heading+Math.PI-camera.rotation.y;dy=Math.atan2(Math.sin(dy),Math.cos(dy));camera.rotation.y+=dy*Math.min(1,delta*2.5);
        walk.stuck=feet.distanceTo(before)<delta*.2?walk.stuck+delta:0;
        if(walk.stuck>.35){const done=walk.done;walk=null;done?.();}
      }
    }
    if(anim){anim.t=Math.min(1,anim.t+delta/anim.dur);const k=1-(1-anim.t)**3;camera.rotation.y=anim.y0+(anim.y1-anim.y0)*k;camera.rotation.x=anim.x0+(anim.x1-anim.x0)*k;if(mode==='first')camera.position.lerpVectors(anim.p0,anim.p1,k);if(anim.t>=1)anim=null;}
    if(mode==='third'){avatar.position.copy(feet);avatar.animate?.(time,moving);follow();}
    for(const a of actors)a.animate?.(time,a.userData.hot);
    onFrame?.(camera,{feet:mode==='third'?feet:camera.position,mode,time});
    if(splat&&time-lastPositionUpdate>.1){lastPositionUpdate=time;const p=mode==='third'?[feet.x,config.home[1],feet.z]:camera.position.toArray();onPosition?.({distance:navigationDistance(p,config.home),edge:atEdge});}
    renderer.render(scene,camera);
  })();
  onStatus?.('loading');
  import('@sparkjsdev/spark').then(async({SplatMesh})=>{
    const next=new SplatMesh({url:splatURL});await next.initialized;
    if(closed){next.dispose();return;}
    next.scale.setScalar(config.metric_scale_factor);next.rotation.x=Math.PI;next.position.y=config.ground_plane_offset;
    splat=next;scene.add(next);onStatus?.('splat');
  }).catch(()=>{if(!closed)onStatus?.('error');});
  return {
    move(direction){move(direction,mode==='third'?.6:1);},
    setMove(direction,active){if(active){heldMoves.add(direction);walk=null;}else heldMoves.delete(direction);},
    reset(){atEdge=false;anim=null;walk=null;home();},
    camera,
    get mode(){return mode;},
    setMode,
    // Third person only: walk the avatar to [x,0,z], then call done (also when the roaming edge blocks the way).
    walkTo(to,done,stop=.5){if(mode!=='third'){done?.();return;}anim=null;walk={to,done,stop,stuck:0};},
    // Extra scene objects (guide, portals). An object's animate(time,hot) runs every frame; set userData.hot to highlight it.
    add(o){scene.add(o);actors.add(o);return o;},
    // Animated view preset relative to the start view: yaw/pitch in radians, rise in metres (kept inside the roaming box).
    look({yaw=0,pitch=0,rise=0,fromHome=true}={}){
      const y1=(fromHome?homeRot.y:camera.rotation.y)+yaw;let y0=camera.rotation.y;y0+=Math.round((y1-y0)/(2*Math.PI))*2*Math.PI;
      const base=fromHome?new T.Vector3(...config.home):camera.position.clone(),p1=new T.Vector3(...clampToBounds([base.x,base.y+rise,base.z],config.home,config.bounds));
      // In third person the follow camera owns the position; only the angle animates, kept within the follow pitch range.
      anim={t:0,dur:1.1,y0,y1,x0:camera.rotation.x,x1:mode==='third'?T.MathUtils.clamp(pitch-.12,-.9,.35):pitch,p0:camera.position.clone(),p1};atEdge=false;walk=null;
    },
    dispose(){closed=true;clearKeys();cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('keyup',keyUp);window.removeEventListener('blur',clearKeys);splat?.dispose();renderer.dispose();el.remove();}
  };
}
