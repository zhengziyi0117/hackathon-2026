import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {MAP_PACKAGES,STYLES} from '../src/map3d/packages.js';
import {validatePackage} from '../src/map3d/contract.js';
import {createModelKit} from '../src/map3d/models.js';
import {disposeTree} from '../src/map3d/dispose.js';
import {createWorkspace,upgradeWorkspace,createScenicState,worldAsset} from '../src/scenic-core.js';
import {assetFiles} from '../src/content/catalog.js';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sources from '../scenics/forbidden-city/provenance/photo-sources.json' with {type:'json'};
const p=MAP_PACKAGES['forbidden-city'],g=p.geo;

test('palace has a validated distinct package, every observation point is reachable and can exit',()=>{
 assert.deepEqual(validatePackage(p,STYLES),[]);assert.equal(Object.keys(g.SPOT_GEO).length,12);
 for(const [id,s] of Object.entries(g.SPOT_GEO)){
  assert.ok(g.shortestPath(p.interaction.startNode,s.node),'entry to '+id);
  assert.ok(p.interaction.presentation.exitNodes.some(exit=>g.shortestPath(s.node,exit)),id+' can exit');
 }
 for(let i=1;i<p.interaction.presentation.tour.length;i++){
  const a=g.SPOT_GEO[p.interaction.presentation.tour[i-1]].node,b=g.SPOT_GEO[p.interaction.presentation.tour[i]].node;
  const route=g.shortestPath(a,b);assert.ok(route);
  for(let j=1;j<route.nodes.length;j++)assert.ok(g.canTravel(...g.NODES[route.nodes[j-1]],...g.NODES[route.nodes[j]]));
 }
});
test('walls, buildings, closed gates and one-way portals also block direct/keyboard movement',()=>{
 assert.equal(g.walkable(0,7.4),false);assert.equal(g.walkable(0,14.3),false);
 assert.ok(g.walkable(6.4,13));assert.ok(g.walkable(6.4,15.3));assert.equal(g.canTravel(6.4,13,6.4,15.3),false);
 assert.equal(g.canTravel(0,24.3,0,25.3),false);assert.equal(g.canTravel(0,24.3,0,23.3),true);
 assert.equal(g.canTravel(0,25.3,0,23.3),true);assert.equal(g.canTravel(0,23.3,0,25.3),false);
 assert.equal(g.walkable(19.2,0),false);assert.equal(g.walkable(0,17.9),true);
 assert.equal(g.canTravel(0,16,0,12.8),false);
 assert.ok(g.shortestPath('taihemen-view','taihedian-view').nodes.length>2);
});
test('every palace style produces finite selectable geometry with labels above roofs',()=>{
 for(const id of p.manifest.styles){
  const kit=createModelKit(STYLES[id]),root=new T.Group();
  for(const m of p.layout.landmarks){
   const o=kit.landmark(m.model,m.parameters),box=new T.Box3().setFromObject(o);
   assert.ok(box.max.y<=o.userData.top+.001,`${id}/${m.id} top ${box.max.y} <= ${o.userData.top}`);
   o.traverse(o=>{if(o.geometry)for(const key of ['position','normal'])for(const n of o.geometry.attributes[key].array)assert.ok(Number.isFinite(n));});root.add(o);
  }
  disposeTree(root);
 }
});
test('palace seed migrates once without replacing edits, publications, custom scenes or deletions',()=>{
 const old={schema:8,scenics:[createScenicState()]};old.scenics[0].draft.title='用户的西湖';
 const ws=upgradeWorkspace(old),palace=ws.scenics.find(s=>s.id==='forbidden-city');
 assert.equal(ws.scenics[0].draft.title,'用户的西湖');assert.equal(palace.published.spots.length,12);
 palace.draft.title='自定义故宫';palace.published.spots[0].description='人工修订';
 upgradeWorkspace(ws);assert.equal(ws.scenics.length,2);assert.equal(palace.draft.title,'自定义故宫');assert.equal(palace.published.spots[0].description,'人工修订');
 ws.scenics=ws.scenics.filter(s=>s.id!=='forbidden-city');upgradeWorkspace(ws);assert.equal(ws.scenics.length,1);
 for(const s of createWorkspace().scenics[1].published.spots)assert.equal(worldAsset(s),null);
});
test('mismatched model footprint and unversioned physical fields are rejected',()=>{
 for(const mutate of [x=>x.layout.landmarks[0].at[0]+=1,x=>x.layout.landmarks[0].parameters.width+=1,x=>x.geography.schemaVersion=1,x=>x.interaction.presentation.tour.push('missing')]){
  const c=structuredClone({manifest:p.manifest,geography:p.geography,layout:p.layout,interaction:p.interaction});mutate(c);assert.ok(validatePackage(c,STYLES).length);
 }
});
test('all twelve real photos are local, attributed, licensed and hash verified',async()=>{
 assert.equal(sources.images.length,12);
 for(const im of sources.images){
  assert.ok(im.author&&im.sourcePage.startsWith('https://commons.wikimedia.org/')&&im.licenseUrl.startsWith('https://creativecommons.org/'));
  const b=await readFile(new URL('../'+assetFiles.get(im.path),import.meta.url));
  assert.equal(createHash('sha256').update(b).digest('hex'),im.sha256);assert.ok(b.length<310000);
 }
});

// Roof face winding is essential: inverted surfaces turn soft shadows into acne.
test('palace roof faces point upward and have no subpixel tile-rib geometry',()=>{
 const kit=createModelKit(STYLES.imperial),root=new T.Group();
 for(const entry of p.layout.landmarks.filter(m=>m.model==='palace-hall')){
  const o=kit.landmark(entry.model,entry.parameters);root.add(o);
  o.traverse(m=>{if(!m.isMesh||!m.material.customProgramCacheKey().startsWith('palace-roof-filtered'))return;
   const a=m.geometry.attributes.position,u=new T.Vector3(),v=new T.Vector3(),w=new T.Vector3();let area=0;
   assert.ok(a.count<7000,'roof stays within a small geometry budget');
   for(let i=0;i<a.count;i+=3){u.fromBufferAttribute(a,i);v.fromBufferAttribute(a,i+1).sub(u);w.fromBufferAttribute(a,i+2).sub(u);const cross=v.cross(w);assert.ok(cross.y>=-1e-6,'upward face');area+=cross.y;}
   assert.ok(area>0,'nonempty roof');
  });
 }
 disposeTree(root);
});
