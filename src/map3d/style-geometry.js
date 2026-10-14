import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Geometry recipes have no scenic coordinates. A style chooses a vocabulary;
// layout.json still owns the locations, scale and identity of every landmark.
function join(parts){
 const flat=parts.map(g=>g.index?g.toNonIndexed():g);
 const out=mergeGeometries(flat);
 for(const g of new Set([...parts,...flat]))g.dispose();
 return out;
}
const rounded=(w,h,d,r=.04)=>new RoundedBoxGeometry(w,h,d,2,Math.min(r,w/5,h/5,d/5));
const ball=(r,x,y,z,sx=1,sy=1,sz=1)=>new T.SphereGeometry(r,12,8).scale(sx,sy,sz).translate(x,y,z);
const cube=(w,h,d,x=0,y=0,z=0)=>new T.BoxGeometry(w,h,d).translate(x,y,z);

function steppedRoof({R=1,h=.5,sides=4},studs=false){
 const count=studs?4:6,parts=[],width=R*(sides===4?Math.SQRT2:1.8);
 for(let i=0;i<count;i++){
  const w=width*(1-i/(count+1)),hh=h/count;
  parts.push((studs?rounded(w,hh,w,.025):cube(w,hh,w)).translate(0,hh*(i+.5),0));
  if(studs){
   // Exposed studs on every tier, sharing one merged geometry per roof.
   const r=Math.min(.035,w/12),at=w*.36;
   for(const x of [-at,at])for(const z of [-at,at])parts.push(new T.CylinderGeometry(r,r,hh*.35,10).translate(x,hh*(i+1.15),z));
  }
 }
 return join(parts);
}

function voxelTrees(){
 return {
  round:()=>join([cube(.44,.27,.42,0,.46,0),cube(.32,.18,.32,0,.68,0),cube(.18,.2,.24,.22,.45,.02),cube(.16,.21,.2,-.2,.5,-.06)]),
  conifer:()=>join([cube(.43,.18,.43,0,.34),cube(.32,.19,.32,0,.51),cube(.22,.18,.22,0,.68),cube(.11,.16,.11,0,.83)]),
  willow:()=>join([cube(.48,.26,.44,0,.6),cube(.33,.16,.3,0,.8),...[-1,1].flatMap(a=>[cube(.09,.38,.1,a*.21,.3,.16),cube(.1,.43,.1,a*.2,.33,-.17)])]),
  peach:()=>join([cube(.34,.24,.3,0,.41),cube(.22,.15,.22,.03,.59),cube(.16,.18,.19,-.17,.42)]),
  trunk:()=>cube(.065,.36,.065,0,.18),
 };
}
function brickTree(w,h,levels){
 const parts=[];
 for(let i=0;i<levels;i++){
  const ww=w*(1-i/(levels+1)),y=.3+i*h;
  parts.push(rounded(ww,h*.92,ww,.035).translate(0,y,0));
  for(const x of [-1,1])for(const z of [-1,1])parts.push(new T.CylinderGeometry(ww*.085,ww*.085,.04,12).translate(x*ww*.25,y+h*.5,z*ww*.25));
 }
 return join(parts);
}
function adventureTrees(){
 return {
  round:()=>join([ball(.29,0,.55,0,1,1.15,1),ball(.19,-.2,.46,.02),ball(.2,.18,.48,.05)]),
  conifer:()=>join([ball(.26,0,.44,0,1,1.2,1),ball(.2,0,.68,0,1,1.3,1),ball(.13,0,.87,0,1,1.45,1)]),
  willow:()=>join([ball(.28,0,.64,0,1.1,.8,1),...Array.from({length:7},(_,i)=>{const a=i/7*Math.PI*2;return ball(.13,Math.sin(a)*.23,.37,Math.cos(a)*.23,.75,2.3,.75);})]),
  peach:()=>join([ball(.19,0,.48,0),ball(.15,-.13,.37,0),ball(.14,.13,.4,.04)]),
  trunk:()=>new T.CylinderGeometry(.032,.055,.4,10).translate(0,.2,0),
 };
}

export function createStyleGeometry(style){
 const kind=style.geometry,voxel=kind==='voxel',bricks=kind==='bricks',adventure=kind==='adventure',playful=voxel||bricks||adventure;
 const shapes={
  playful,
  box:(w,h,d,...rest)=>bricks||adventure?rounded(w,h,d,adventure?.08:.025):new T.BoxGeometry(w,h,d,...rest),
  cylinder:(rt,rb,h,...rest)=>voxel?cube(Math.max(rt,rb)*1.6,h,Math.max(rt,rb)*1.6):new T.CylinderGeometry(rt,rb,h,...rest),
  sphere:(r,...rest)=>voxel?cube(r*1.65,r*1.65,r*1.65):new T.SphereGeometry(r,...rest),
  roof:(params,fallback)=>voxel||bricks?steppedRoof(params,bricks):fallback(adventure?{...params,h:params.h*1.18,flare:.8}:params),
  trees:voxel?voxelTrees():bricks?{
   round:()=>brickTree(.5,.18,3),conifer:()=>brickTree(.45,.17,4),willow:()=>brickTree(.53,.17,3),peach:()=>brickTree(.38,.16,3),
   trunk:()=>new T.CylinderGeometry(.04,.04,.34,12).translate(0,.17,0),
  }:adventure?adventureTrees():null,
  houseRoof:()=>voxel||bricks?steppedRoof({R:.27,h:.13,sides:4},bricks).scale(1,1,.75).translate(0,.2,0):adventure?rounded(.4,.13,.31,.065).translate(0,.24,0):null,
  cityBlock:()=>bricks?join([rounded(.5,.5,.4,.035).translate(0,.25,0),...[-1,1].map(x=>new T.CylinderGeometry(.065,.065,.05,12).translate(x*.12,.525,0))]):adventure?rounded(.5,.5,.4,.08).translate(0,.25,0):cube(.5,.5,.4,0,.25),
 };
 return shapes;
}

// The controller only depends on body/um/ring/raft; each style can dress the
// traveller differently without replacing navigation or animation rules.
export function createPlayfulTraveler(style,MAT,boat){
 const voxel=style.geometry==='voxel',bricks=style.geometry==='bricks';
 const g=new T.Group(),body=new T.Group(),um=new T.Group();g.add(body);body.add(um);
 const add=(geo,mat,x,y,z,parent=body)=>{const m=new T.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;parent.add(m);return m;};
 const box=(w,h,d)=>voxel?cube(w,h,d):rounded(w,h,d,.025);
 const sphere=r=>voxel?cube(r*1.7,r*1.7,r*1.7):new T.SphereGeometry(r,16,12);
 for(const x of [-.047,.047]){
  add(box(.065,.1,.09),MAT.woodDark,x,.05,.015);
  add(box(.055,.11,.065),MAT.robe,x,.13,0);
 }
 add(box(.18,.17,.11),MAT.robe,0,.245,0);
 for(const x of [-.12,.12]){add(box(.055,.16,.065),MAT.robe,x,.24,0);add(sphere(.032),MAT.skin,x,.15,0);}
 add(bricks?new T.CylinderGeometry(.075,.075,.12,16):sphere(.087),MAT.skin,0,.4,0);
 if(voxel){
  add(box(.17,.055,.16),MAT.hair,0,.483,0);
  add(box(.19,.035,.18),MAT.umbrella,0,.475,.015);
 }else if(bricks){
  add(new T.SphereGeometry(.085,16,10,0,Math.PI*2,0,Math.PI/2),MAT.umbrella,0,.455,0);
  add(rounded(.15,.025,.12,.02),MAT.umbrella,0,.456,.055);
 }else{
  add(new T.CylinderGeometry(.13,.13,.035,24),MAT.umbrella,0,.463,0);
  add(new T.SphereGeometry(.085,16,10,0,Math.PI*2,0,Math.PI/2),MAT.umbrella,0,.48,0);
  add(new T.CylinderGeometry(.087,.087,.018,20),MAT.gold,0,.494,0);
 }
 for(const x of [-.028,.028])add(voxel?cube(.018,.02,.008):new T.SphereGeometry(.01,8,6),MAT.hair,x,.408,.078);
 add(box(.13,.14,.08),MAT.hull,0,.27,-.085); // backpack
 add(box(.08,.075,.01),MAT.gold,0,.26,-.13);
 if(!voxel){ // rolled map strapped to the pack
  add(new T.CylinderGeometry(.022,.022,.16,10).rotateZ(Math.PI/2),MAT.stone,0,.35,-.095);
 }
 const ring=new T.Mesh(new T.RingGeometry(.16,.21,voxel?4:40),new T.MeshBasicMaterial({color:'#fff4d6',transparent:true,opacity:.75,depthWrite:false}));
 ring.rotation.x=-Math.PI/2;ring.position.y=.012;g.add(ring);
 const raft=boat();raft.scale.setScalar(1.5);raft.visible=false;g.add(raft);
 return Object.assign(g,{parts:{body,um,ring,raft}});
}
