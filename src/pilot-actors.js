import * as T from 'three';
import miniature from './map3d/styles/miniature.json' with {type:'json'};
import {createModelKit} from './map3d/models.js';
// In-world actors for a spot scene: the visitor's avatar, the guide NPC and portals to neighbouring spots.
// They reuse the big map's traveler so the visitor is the same character on the map and inside a spot.
// Sizes are metres in the generated world's metric frame.
const HEIGHT=1.65,TRAVELER_TOP=.56;
let kit;const kitOf=()=>kit||=createModelKit(miniature);

function bob(t,parts,moving){
 const {body,um}=parts;
 body.position.y=moving?Math.abs(Math.sin(t*9))*.03:0;body.rotation.z=moving?Math.sin(t*9)*.07:0;
 if(um)um.rotation.z=Math.sin(t*2)*.05+(moving?.12:0);
}
export function createAvatar(){
 const o=kitOf().traveler();o.scale.setScalar(HEIGHT/TRAVELER_TOP);
 // The umbrella reads well from above on the map but fills the frame behind the visitor's shoulder.
 o.parts.raft.visible=false;o.parts.um.visible=false;
 return Object.assign(o,{animate(t,moving){bob(t,o.parts,moving);}});
}
export function createGuide(){
 const o=kitOf().traveler(),{body,um,ring}=o.parts;o.scale.setScalar(HEIGHT/TRAVELER_TOP*.95);
 o.parts.raft.visible=false;um.visible=false;
 // A distinct robe colour so the guide reads as a different person from the visitor.
 body.traverse(c=>{if(c.isMesh&&c.material===kit.MAT.robe){c.material=c.material.clone();c.material.color.set('#c8643b');}});
 ring.material=ring.material.clone();ring.material.color.set('#ffd27a');
 return Object.assign(o,{animate(t,talking){body.rotation.z=Math.sin(t*1.4)*.02;body.position.y=talking?Math.abs(Math.sin(t*6))*.012:0;ring.material.opacity=.45+Math.sin(t*3)*.3;}});
}
// A moon-gate ring standing on the ground, facing the visitor's start point.
export function createPortal(){
 const g=new T.Group(),glow=new T.MeshBasicMaterial({color:'#ffe2a8',transparent:true,opacity:.5,depthWrite:false,side:T.DoubleSide,blending:T.AdditiveBlending});
 const frame=new T.Mesh(new T.TorusGeometry(.62,.05,10,48),new T.MeshStandardMaterial({color:'#b98a4e',roughness:.5,metalness:.2,emissive:'#5a3a12',emissiveIntensity:.4}));
 frame.position.y=.72;g.add(frame);
 const veil=new T.Mesh(new T.CircleGeometry(.58,40),glow);veil.position.y=.72;g.add(veil);
 const pad=new T.Mesh(new T.RingGeometry(.35,.6,40),glow.clone());pad.rotation.x=-Math.PI/2;pad.position.y=.02;g.add(pad);
 return Object.assign(g,{animate(t,hot){const k=hot?1:.55;veil.material.opacity=(.28+Math.sin(t*2.2)*.12)*k;pad.material.opacity=(.35+Math.sin(t*2.2+1)*.2)*k;frame.material.emissiveIntensity=hot?.9:.4;}});
}
// Where a portal toward compass `bearing` stands. heading is the compass bearing of the start view.
// edge: the last walkable point in that direction inside the roaming box (offsets from home), where entering triggers;
// at: the gate itself, a little beyond, so it reads as a doorway out of the scene instead of crowding the start.
export function portalSpot(home,target,heading,bearing,bounds,reach=6){
 const len=Math.hypot(target[0]-home[0],target[2]-home[2])||1,fx=(target[0]-home[0])/len,fz=(target[2]-home[2])/len;
 const rel=(bearing-heading)*Math.PI/180,dx=fx*Math.cos(rel)-fz*Math.sin(rel),dz=fz*Math.cos(rel)+fx*Math.sin(rel);
 const lim=(d,min,max)=>d>1e-6?max/d:d<-1e-6?min/d:Infinity;
 const r=bounds?Math.min(reach,lim(dx,bounds.min[0],bounds.max[0]),lim(dz,bounds.min[2],bounds.max[2])):reach;
 const gate=Math.max(3.2,r+1);
 return {edge:[home[0]+dx*r,0,home[2]+dz*r],at:[home[0]+dx*gate,0,home[2]+dz*gate]};
}
