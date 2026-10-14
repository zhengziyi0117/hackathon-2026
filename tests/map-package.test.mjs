import test from 'node:test';
import assert from 'node:assert/strict';
import baseline from './fixtures/westlake-baseline.json' with {type:'json'};
import {MAP_PACKAGES,STYLES,styleFor} from '../src/map3d/packages.js';
import {validatePackage} from '../src/map3d/contract.js';
import {createModelKit} from '../src/map3d/models.js';
const pkg=MAP_PACKAGES.westlake;
const copy=()=>structuredClone({manifest:pkg.manifest,geography:pkg.geography,layout:pkg.layout,interaction:pkg.interaction});

test('v1 package is valid and an unknown style safely falls back',()=>{
 assert.deepEqual(validatePackage(pkg,STYLES),[]);
 assert.equal(styleFor(pkg,'unknown').id,'miniature');assert.equal(styleFor(pkg,'papercraft').id,'papercraft');
});
test('the extracted geography preserves the backed-up terrain and routes',()=>{
 const g=pkg.geo;assert.deepEqual(g.NODES,baseline.nodes);assert.deepEqual(g.EDGES,baseline.edges);assert.deepEqual(g.SPOT_GEO,baseline.spots);
 for(const s of baseline.samples){
  assert.ok(Math.abs(g.landField(s.x,s.z)-s.land)<1e-10);
  assert.ok(Math.abs(g.terrainHeight(s.x,s.z)-s.height)<1e-10);
  assert.ok(Math.abs(g.groundHeight(s.x,s.z)-s.ground)<1e-10);
  assert.equal(g.walkable(s.x,s.z),s.walkable);
 }
});
test('invalid map packages are rejected before rendering',()=>{
 const cases=[
  p=>p.manifest.schemaVersion=2,p=>p.layout.mapId='other',p=>p.interaction.startNode='missing',
  p=>p.geography.network.edges[0].a='missing',p=>p.geography.spots.huagang.node='missing',
  p=>p.layout.landmarks[0].model='remote-script',p=>p.layout.landmarks[0].parameters.javascript=1,
  p=>p.layout.landmarks[0].at=[Infinity,0],p=>p.layout.landmarks[0].at=[10000,0],
  p=>p.layout.landmarks=p.layout.landmarks.filter(m=>m.spotId!=='huagang'),p=>p.layout.landmarks.push(p.layout.landmarks[0]),
  p=>p.manifest.styles.push('missing'),p=>p.interaction.camera.minDistance=1000
 ];
 for(const mutate of cases){const p=copy();mutate(p);assert.ok(validatePackage(p,STYLES).length,mutate.toString());}
 const styles=structuredClone(STYLES);styles.papercraft.surface.paperGrain='broken';assert.ok(validatePackage(pkg,styles).length);
});
test('styles have isolated materials and different geometry while retaining every landmark recipe',()=>{
 const a=createModelKit(STYLES.miniature),b=createModelKit(STYLES.papercraft);
 assert.notEqual(a.MAT.stone,b.MAT.stone);assert.notEqual(a.U.uTime,b.U.uTime);
 const old=a.MAT.roof.color.getHex();b.MAT.roof.color.set('#ff0000');assert.equal(a.MAT.roof.color.getHex(),old);
 assert.notEqual(a.TREE_GEO.round().attributes.position.count,b.TREE_GEO.round().attributes.position.count);
 for(const m of pkg.layout.landmarks){const x=a.landmark(m.model,m.parameters),y=b.landmark(m.model,m.parameters);assert.equal(x.children.length,y.children.length);assert.ok(x.userData.top>0);assert.equal(x.userData.top,y.userData.top);}
});
