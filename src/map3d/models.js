import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Shared uniforms drive every material: snow cover, night lighting and wind.
export const U={uTime:{value:0},uSnow:{value:0},uNight:{value:0},uGrassTint:{value:new T.Color(1,1,1)}};

// Adds snow on upward faces (and optional grass tint / wind sway) to a standard material.
export function weatherize(mat,{tint=false,sway=0,key=''}={}){
 mat.onBeforeCompile=sh=>{
  Object.assign(sh.uniforms,{uSnow:U.uSnow,uTime:U.uTime,uGrassTint:U.uGrassTint});
  sh.vertexShader=sh.vertexShader
   .replace('#include <common>',`#include <common>
uniform float uTime;varying float vUpW;${tint?'attribute float aGrass;varying float vGrass;':''}`)
   .replace('#include <begin_vertex>',`#include <begin_vertex>
${sway?`#ifdef USE_INSTANCING
 vec3 ip=instanceMatrix[3].xyz;float sw=pow(1.-clamp(position.y/.8,0.,1.),1.5);
 transformed.x+=sin(uTime*1.7+ip.x*1.9+ip.z*.7)*${sway.toFixed(3)}*sw;transformed.z+=cos(uTime*1.25+ip.z*1.4)*${(sway*.7).toFixed(3)}*sw;
#endif`:''}`)
   .replace('#include <project_vertex>',`#include <project_vertex>
 vec3 nW=objectNormal;
#ifdef USE_INSTANCING
 nW=mat3(instanceMatrix)*nW;
#endif
 vUpW=normalize(mat3(modelMatrix)*nW).y;${tint?'vGrass=aGrass;':''}`);
  sh.fragmentShader=sh.fragmentShader
   .replace('#include <common>',`#include <common>
uniform float uSnow;uniform vec3 uGrassTint;varying float vUpW;${tint?'varying float vGrass;':''}`)
   .replace('#include <color_fragment>',`#include <color_fragment>
${tint?'diffuseColor.rgb*=mix(vec3(1.),uGrassTint,vGrass);':''}
 diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.93,.95,.99),uSnow*smoothstep(.3,.72,vUpW));`);
 };
 mat.customProgramCacheKey=()=>'wx'+tint+sway+key;
 return mat;
}
const std=(color,o={})=>weatherize(new T.MeshStandardMaterial({color,roughness:.82,metalness:0,...o}),o.wx);
export const MAT={
 stone:std('#d8d1c2'),stoneDark:std('#a49d8f'),wall:std('#ffffff'),wood:std('#9a3a28'),woodDark:std('#5b2a1e'),
 roof:std('#4f5a66',{side:T.DoubleSide}),roofCity:std('#ffffff',{side:T.DoubleSide}),roofBronze:std('#a5803f',{side:T.DoubleSide,metalness:.35,roughness:.5}),
 gold:std('#d9b25a',{metalness:.6,roughness:.35}),pagoda:std('#a24a30'),hull:std('#7d5236'),awning:std('#2a2a2c'),
 skin:new T.MeshStandardMaterial({color:'#f3d6b8',roughness:.7}),robe:std('#2f6d70'),hair:new T.MeshStandardMaterial({color:'#2a211d',roughness:.6}),
 umbrella:new T.MeshStandardMaterial({color:'#c73b2b',roughness:.55,side:T.DoubleSide}),
};
// Night lights: emissive intensity follows U.uNight, updated by the scene each frame.
export const GLOW=[];
export function glowMat(color,day=.15,night=3.2,base='#000'){const m=new T.MeshStandardMaterial({color:base,emissive:color,emissiveIntensity:day,roughness:1});m.userData.glow=[day,night];GLOW.push(m);return m;}

// Curved Chinese roof over a regular polygon: steep near the ridge, flat at the eaves, corners lifted.
export function roofGeo({sides=4,R=1,h=.5,flare=.3,rows=8,rot=Math.PI/4}){
 const cols=sides*8,pos=[],idx=[],ca=Math.cos(Math.PI/sides);
 for(let r=0;r<=rows;r++){
  const t=r/rows;
  for(let c=0;c<=cols;c++){
   const th=c/cols*Math.PI*2,local=((th-rot)%(2*Math.PI/sides)+2*Math.PI/sides)%(2*Math.PI/sides)-Math.PI/sides;
   const poly=ca/Math.cos(local),corner=(poly-ca)/(1-ca),rr=R*t*poly;
   pos.push(Math.sin(th)*rr,h*(1-t)**2+flare*h*t**3*corner,Math.cos(th)*rr);
  }
 }
 for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){const a=r*(cols+1)+c,b=a+cols+1;idx.push(a,b,a+1,b,b+1,a+1);}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();return g;
}
const mesh=(g,m,cast=true)=>{const o=new T.Mesh(g,m);o.castShadow=cast;o.receiveShadow=true;return o;};

export function pavilion({size=.5,height=.42,roofH=.3,base=true}={}){
 const g=new T.Group(),half=size/2*.82;
 if(base){const b=mesh(new T.BoxGeometry(size*1.35,.07,size*1.35),MAT.stone);b.position.y=.035;g.add(b);}
 for(const [x,z] of [[-1,-1],[1,-1],[1,1],[-1,1]]){const c=mesh(new T.CylinderGeometry(.028,.032,height,8),MAT.wood);c.position.set(x*half,.07+height/2,z*half);g.add(c);}
 const beam=mesh(new T.BoxGeometry(size*.95,.05,size*.95),MAT.woodDark);beam.position.y=.07+height;g.add(beam);
 const roof=mesh(roofGeo({sides:4,R:size*.92,h:roofH,flare:.42}),MAT.roof);roof.position.y=.07+height+.02;g.add(roof);
 const fin=mesh(new T.SphereGeometry(.035,10,8),MAT.gold);fin.position.y=.07+height+roofH+.04;g.add(fin);
 g.userData.top=.07+height+roofH+.1;return g;
}
export function pagoda({tiers=5,r=.52,body=.3,bodyMat=MAT.pagoda,roofMat=MAT.roofBronze,windows='#ffc56b'}={}){
 const g=new T.Group();let y=0;
 const pod=mesh(new T.CylinderGeometry(r+.25,r+.32,.22,8),MAT.stone);pod.position.y=.11;g.add(pod);y=.22;
 const win=glowMat(windows,.2,4.5);
 for(let i=0;i<tiers;i++){
  const ri=r-i*.055,b=mesh(new T.CylinderGeometry(ri*.9,ri,body,8),bodyMat);b.position.y=y+body/2;g.add(b);
  const w=mesh(new T.CylinderGeometry(ri*.93,ri*.95,body*.32,8,1,true),win,false);w.position.y=y+body*.5;g.add(w);
  const roof=mesh(roofGeo({sides:8,R:ri+.2,h:.13,flare:.5,rot:0}),roofMat);roof.position.y=y+body-.02;g.add(roof);
  y+=body+.07;
 }
 const cap=mesh(roofGeo({sides:8,R:.26,h:.3,flare:.3,rot:0}),roofMat);cap.position.y=y-.04;g.add(cap);
 const spire=mesh(new T.CylinderGeometry(.012,.03,.42,8),MAT.gold);spire.position.y=y+.4;g.add(spire);
 for(let i=0;i<3;i++){const s=mesh(new T.SphereGeometry(.045-i*.008,10,8),MAT.gold);s.position.y=y+.3+i*.1;g.add(s);}
 g.userData.top=y+.7;return g;
}
// Stone lantern of Santan Yinyue: a hollow ball with round openings that glow at night.
export function stoneLantern(){
 const g=new T.Group(),pts=[[.0,0],[.11,0],[.1,.04],[.05,.07],[.045,.26],[.07,.3],[.0,.3]].map(([x,y])=>new T.Vector2(x,y));
 g.add(mesh(new T.LatheGeometry(pts,14),MAT.stoneDark));
 const ball=mesh(new T.SphereGeometry(.16,20,14),MAT.stone);ball.position.y=.44;g.add(ball);
 const glow=glowMat('#ffb35a',.25,6);
 for(let i=0;i<5;i++){const a=i/5*Math.PI*2,h=mesh(new T.CircleGeometry(.04,14),glow,false);h.position.set(Math.sin(a)*.161,.44,Math.cos(a)*.161);h.lookAt(Math.sin(a)*2,.44,Math.cos(a)*2);g.add(h);}
 const cap=mesh(roofGeo({sides:6,R:.15,h:.1,flare:.25}),MAT.stoneDark);cap.position.y=.58;g.add(cap);
 const top=mesh(new T.SphereGeometry(.045,10,8),MAT.stoneDark);top.position.y=.71;g.add(top);
 g.userData.top=.85;return g;
}
export function archBridge({length=1.2,height=.24,width=.36,arch=.32,mat=MAT.stone}={}){
 const s=new T.Shape(),L=length/2;
 s.moveTo(-L,0);s.lineTo(-arch,0);s.absarc(0,0,arch,Math.PI,0,true);s.lineTo(L,0);s.lineTo(L,.05);
 for(let i=20;i>=0;i--){const x=-L+i/20*length;s.lineTo(x,.05+height*(1-(x/L)**2));}
 s.lineTo(-L,0);
 const g=new T.ExtrudeGeometry(s,{depth:width,bevelEnabled:false,curveSegments:20});g.translate(0,0,-width/2);
 const grp=new T.Group();grp.add(mesh(g,mat));
 for(const z of [-width/2+.02,width/2-.02])for(let i=1;i<10;i++){const x=-L+i/10*length,p=mesh(new T.BoxGeometry(.025,.07,.025),mat);p.position.set(x,.05+height*(1-(x/L)**2)+.035,z);grp.add(p);}
 grp.userData.top=height+.25;return grp;
}
export function boat(){
 const g=new T.Group(),hull=new T.BoxGeometry(.5,.08,.16,6,1,1),p=hull.attributes.position;
 for(let i=0;i<p.count;i++){const x=p.getX(i),k=1-(Math.abs(x)/.25)**2*.75;p.setZ(i,p.getZ(i)*k);if(p.getY(i)>0)p.setY(i,p.getY(i)+(Math.abs(x)/.25)**2*.05);}
 hull.computeVertexNormals();g.add(mesh(hull,MAT.hull));
 const aw=mesh(new T.CylinderGeometry(.075,.075,.22,10,1,true,-Math.PI/2,Math.PI),MAT.awning);aw.rotation.z=Math.PI/2;aw.position.y=.04;g.add(aw);
 return g;
}
export function traveler(){
 const g=new T.Group(),body=new T.Group();g.add(body);
 const robe=mesh(new T.ConeGeometry(.1,.26,14),MAT.robe);robe.position.y=.13;body.add(robe);
 const head=mesh(new T.SphereGeometry(.075,16,12),MAT.skin);head.position.y=.32;body.add(head);
 const hair=mesh(new T.SphereGeometry(.078,16,12,0,Math.PI*2,0,Math.PI*.55),MAT.hair);hair.position.y=.325;hair.rotation.x=-.25;body.add(hair);
 const bun=mesh(new T.SphereGeometry(.035,10,8),MAT.hair);bun.position.set(0,.4,-.03);body.add(bun);
 const um=new T.Group();um.position.set(.06,.0,0);body.add(um);
 const stick=mesh(new T.CylinderGeometry(.006,.006,.5,6),MAT.woodDark);stick.position.y=.27;um.add(stick);
 const canopy=mesh(roofGeo({sides:16,R:.27,h:.09,flare:0,rows:4,rot:0}),MAT.umbrella);canopy.position.y=.46;um.add(canopy);
 const tip=mesh(new T.SphereGeometry(.012,6,6),MAT.woodDark);tip.position.y=.56;um.add(tip);
 const ring=new T.Mesh(new T.RingGeometry(.16,.21,40),new T.MeshBasicMaterial({color:'#fff4d6',transparent:true,opacity:.75,depthWrite:false}));
 ring.rotation.x=-Math.PI/2;ring.position.y=.012;g.add(ring);
 const raft=boat();raft.scale.setScalar(1.5);raft.visible=false;g.add(raft);
 return Object.assign(g,{parts:{body,um,ring,raft}});
}
// Tree geometries. Canopies are tinted per instance; trunks are a separate instanced mesh.
const jitter=(g,amt,seed=1)=>{const p=g.attributes.position;for(let i=0;i<p.count;i++){const s=Math.sin(i*12.9898+seed*78.233)*43758.5453;const k=1+((s-Math.floor(s))-.5)*amt;p.setXYZ(i,p.getX(i)*k,p.getY(i)*k,p.getZ(i)*k);}g.computeVertexNormals();return g;};
export const TREE_GEO={
 round:()=>jitter(new T.IcosahedronGeometry(.3,1),.22).translate(0,.5,0),
 conifer:()=>mergeGeometries([new T.ConeGeometry(.24,.5,7).translate(0,.45,0),new T.ConeGeometry(.18,.4,7).translate(0,.72,0)]),
 willow:()=>new T.LatheGeometry([[0,.82],[.18,.78],[.3,.62],[.32,.38],[.27,.16],[.16,.06],[.05,.04]].map(([x,y])=>new T.Vector2(x,y)),12),
 peach:()=>jitter(new T.IcosahedronGeometry(.2,1),.25,3).translate(0,.42,0),
 trunk:()=>new T.CylinderGeometry(.025,.04,.36,5).translate(0,.18,0),
};
