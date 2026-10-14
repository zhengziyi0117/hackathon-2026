import * as T from 'three';
import {navigationStep,navigationDistance,clampToBounds} from './navigation.js';
// Walk-only Gaussian Splat viewer for generated scenic worlds. config.bounds is read on every move so callers can change it live.
export function createViewer(container,{onStatus,onPosition,onFrame,splatURL,splatConfig:config}){
  let renderer;
  try{renderer=new T.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});}
  catch{const box=document.createElement('div'),h=document.createElement('h3'),p=document.createElement('p');box.className='viewer-fallback';h.textContent='当前浏览器未启用三维渲染';p.textContent='可尝试 Chrome 或开启硬件加速。';box.append(h,p);container.prepend(box);onStatus?.('error');return {reset(){},move(){},setMove(){},dispose(){}};}
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.NoToneMapping;
  container.prepend(renderer.domElement);renderer.domElement.tabIndex=0;
  renderer.domElement.setAttribute('aria-label','由照片生成的三维景点。拖动环顾，WASD 或方向键移动，Shift 加速，Q 下降、E 上升。');
  const scene=new T.Scene();scene.background=new T.Color('#d6e5dc');
  const camera=new T.PerspectiveCamera(65,1,.1,600);camera.rotation.order='YXZ';
  let homeRot,anim=null;
  const home=()=>{camera.position.set(...config.home);camera.lookAt(...config.target);homeRot=camera.rotation.clone();};home();
  const keyDirections={ArrowUp:'forward',ArrowDown:'back',ArrowLeft:'left',ArrowRight:'right',w:'forward',s:'back',a:'left',d:'right',q:'down',e:'up'};
  const held=new Set(),heldMoves=new Set();let fast=false,dragPoint=null,atEdge=false,splat=null,closed=false,frame,lastPositionUpdate=0;
  function move(direction,distance){
    if(!splat)return;
    const d=new T.Vector3();camera.getWorldDirection(d);
    const next=navigationStep(camera.position.toArray(),d.toArray(),direction,distance),bounded=clampToBounds(next,config.home,config.bounds);
    atEdge=bounded.some((v,i)=>v!==next[i]);camera.position.fromArray(bounded);
  }
  const onDown=e=>{anim=null;dragPoint=[e.clientX,e.clientY];renderer.domElement.focus();renderer.domElement.setPointerCapture(e.pointerId);};
  const onMove=e=>{if(!dragPoint)return;camera.rotation.y-=(e.clientX-dragPoint[0])*.004;camera.rotation.x=T.MathUtils.clamp(camera.rotation.x-(e.clientY-dragPoint[1])*.004,-1.3,1.3);dragPoint=[e.clientX,e.clientY];};
  const release=()=>{dragPoint=null;};
  const keyOf=e=>e.key.length===1?e.key.toLowerCase():e.key;
  const key=e=>{const k=keyOf(e);if(k==='Shift'){fast=true;return;}if(keyDirections[k]){e.preventDefault();held.add(k);}};
  const keyUp=e=>{const k=keyOf(e);held.delete(k);if(k==='Shift')fast=false;};
  const clearKeys=()=>{held.clear();heldMoves.clear();fast=false;};
  const wheel=e=>{e.preventDefault();move(e.deltaY>0?'forward':'back',Math.min(2,Math.max(.12,Math.abs(e.deltaY)*.008)));};
  const el=renderer.domElement;
  el.addEventListener('pointerdown',onDown);el.addEventListener('pointermove',onMove);el.addEventListener('pointerup',release);el.addEventListener('pointercancel',release);
  el.addEventListener('keydown',key);el.addEventListener('blur',()=>{held.clear();fast=false;});el.addEventListener('wheel',wheel,{passive:false});
  window.addEventListener('keyup',keyUp);window.addEventListener('blur',clearKeys);
  const observer=new ResizeObserver(()=>{const w=container.clientWidth,h=container.clientHeight;if(!w||!h)return;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();});observer.observe(container);
  const clock=new T.Clock();
  (function render(){
    if(closed)return;frame=requestAnimationFrame(render);
    const delta=Math.min(clock.getDelta(),.05),time=clock.elapsedTime;
    const directions=new Set([...held].map(k=>keyDirections[k]).concat([...heldMoves]));
    for(const direction of directions)move(direction,delta*(fast?9:3)/Math.sqrt(directions.size));
    if(anim){anim.t=Math.min(1,anim.t+delta/anim.dur);const k=1-(1-anim.t)**3;camera.rotation.y=anim.y0+(anim.y1-anim.y0)*k;camera.rotation.x=anim.x0+(anim.x1-anim.x0)*k;camera.position.lerpVectors(anim.p0,anim.p1,k);if(anim.t>=1)anim=null;}
    onFrame?.(camera);
    if(splat&&time-lastPositionUpdate>.1){lastPositionUpdate=time;onPosition?.({distance:navigationDistance(camera.position.toArray(),config.home),edge:atEdge});}
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
    move(direction){move(direction,1);},
    setMove(direction,active){if(active)heldMoves.add(direction);else heldMoves.delete(direction);},
    reset(){atEdge=false;anim=null;home();},
    camera,
    // Animated view preset relative to the start view: yaw/pitch in radians, rise in metres (kept inside the roaming box).
    look({yaw=0,pitch=0,rise=0,fromHome=true}={}){
      const y1=(fromHome?homeRot.y:camera.rotation.y)+yaw;let y0=camera.rotation.y;y0+=Math.round((y1-y0)/(2*Math.PI))*2*Math.PI;
      const base=fromHome?new T.Vector3(...config.home):camera.position.clone(),p1=new T.Vector3(...clampToBounds([base.x,base.y+rise,base.z],config.home,config.bounds));
      anim={t:0,dur:1.1,y0,y1,x0:camera.rotation.x,x1:pitch,p0:camera.position.clone(),p1};atEdge=false;
    },
    dispose(){closed=true;clearKeys();cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('keyup',keyUp);window.removeEventListener('blur',clearKeys);splat?.dispose();renderer.dispose();el.remove();}
  };
}
