import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {MAP_PACKAGES,STYLES} from '../src/map3d/packages.js';
import {createModelKit} from '../src/map3d/models.js';
import {createSurface} from '../src/map3d/surface.js';
import {createTerraces} from '../src/map3d/terraces.js';
import {validatePackage} from '../src/map3d/contract.js';
import {disposeTree} from '../src/map3d/dispose.js';
const pkg=MAP_PACKAGES.westlake,geo=pkg.geo;

test('every style supplies finite landmark geometry and the complete traveller animation interface',()=>{
 const profiles=Object.values(STYLES);
 for(const style of profiles){
  const kit=createModelKit(style),root=new T.Group();
  for(const entry of pkg.layout.landmarks){
   const landmark=kit.landmark(entry.model,entry.parameters),bounds=new T.Box3().setFromObject(landmark);
   assert.ok(bounds.max.y>0&&bounds.max.y<=landmark.userData.top+.08,`${style.id}/${entry.id}: label clears model`);
   root.add(landmark);
  }
  const hero=kit.traveler();
  for(const part of ['body','um','ring','raft'])assert.ok(hero.parts[part]?.isObject3D,`${style.id}: ${part}`);
  assert.equal(hero.parts.raft.visible,false);root.add(hero);
  root.traverse(o=>{
   if(!o.geometry)return;
   for(const key of ['position','normal'])for(const v of o.geometry.attributes[key].array)assert.ok(Number.isFinite(v),`${style.id}: finite ${key}`);
  });
  disposeTree(root);
 }
});

test('terraced surface, walker and raycast mesh agree; geometry remains batched',()=>{
 for(const style of [STYLES.voxel,STYLES.bricks]){
  const surface=createSurface(geo,style),kit=createModelKit(style),mesh=createTerraces(surface,geo,style,kit.weatherize);
  mesh.updateMatrixWorld(true);
  assert.ok(surface.tiles.length>500&&surface.tiles.length<55000);
  assert.equal(mesh.children.length,style.id==='bricks'?2:1);
  assert.ok(mesh.children[0].geometry.attributes.position.count<1000000);
  const ray=new T.Raycaster();
  for(let i=0;i<surface.tiles.length;i+=Math.ceil(surface.tiles.length/100)){
   const t=surface.tiles[i],x=t.x+t.dx*.17,z=t.z-t.dz*.11;
   assert.equal(surface.terrainHeight(x,z),t.y);
   assert.equal(surface.groundHeight(x,z),t.y);
   ray.set(new T.Vector3(x,30,z),new T.Vector3(0,-1,0));
   const hit=ray.intersectObject(mesh.children[0],false)[0];
   assert.ok(hit&&Math.abs(hit.point.y-t.y)<1e-5,`${style.id}: walker on visible tile`);
  }
  // Bridge decks retain the exact original arch, including the narrow Su/Bai causeways.
  let bridges=0;
  for(const e of geo.EDGES.filter(e=>e.mode==='walk')){
   const a=geo.NODES[e.a],b=geo.NODES[e.b],n=Math.ceil(e.length/.04);
   for(let i=0;i<=n;i++){
    const x=a[0]+(b[0]-a[0])*i/n,z=a[1]+(b[1]-a[1])*i/n;
    assert.ok(Number.isFinite(surface.groundHeight(x,z)));
    if(geo.groundHeight(x,z)>geo.terrainHeight(x,z)+.001){bridges++;assert.equal(surface.groundHeight(x,z),geo.groundHeight(x,z));}
   }
  }
  assert.ok(bridges>20);disposeTree(mesh);
 }
});

test('continuous styles retain original heights and pathological grid settings are rejected',()=>{
 for(const style of [STYLES.miniature,STYLES.papercraft,STYLES.adventure]){
  const s=createSurface(geo,style);assert.equal(s.terrainHeight,geo.terrainHeight);assert.equal(s.groundHeight,geo.groundHeight);assert.equal(s.tiles.length,0);
 }
 for(const change of [s=>delete s.voxel.landform,s=>s.voxel.landform.cell=.001,s=>s.bricks.landform.step=0,s=>s.voxel.geometry='remote-code']){
  const styles=structuredClone(STYLES);change(styles);assert.ok(validatePackage(pkg,styles).length);
 }
});
