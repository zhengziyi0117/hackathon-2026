import test from 'node:test';
import assert from 'node:assert/strict';
import {MAP_PACKAGES,checkMapPackage,registerMapPackage,packageData} from '../src/map3d/packages.js';
import {geoFor} from '../src/geo-registry.js';
import {portalSpot} from '../src/pilot-actors.js';
import {nextAnswer,mentioned,nearbyText} from '../src/guide-chat.js';
import {draftChanges} from '../src/scenic-core.js';

const spotIds=Object.keys(MAP_PACKAGES.westlake.geography.spots);

test('a runtime map package is validated, registered live and can be removed',()=>{
 const data=packageData('westlake');data.manifest.name='西湖 · 运行时';
 assert.deepEqual(checkMapPackage(data,spotIds),[]);
 assert.deepEqual(registerMapPackage('draft:westlake',data),[]);
 assert.equal(MAP_PACKAGES['draft:westlake'].manifest.name,'西湖 · 运行时');
 assert.ok(geoFor('draft:westlake').SPOT_GEO.huagang,'geo registry reads registered packages');
 registerMapPackage('draft:westlake',null);
 assert.equal(geoFor('draft:westlake'),null);
 // Restoring a bundled id brings back the bundled package.
 registerMapPackage('westlake',null);assert.equal(MAP_PACKAGES.westlake.manifest.name,'西湖');
});
test('invalid runtime packages are never registered',()=>{
 const unknownSpot=packageData('westlake');
 assert.ok(checkMapPackage(unknownSpot,['huagang']).some(e=>e.includes('景区里没有这个景点')));
 const badStyle=packageData('westlake');badStyle.manifest.styles=['miniature','evil'];
 assert.match(checkMapPackage(badStyle)[0],/不支持的风格/);
 const inWater=packageData('westlake');inWater.layout.landmarks.find(m=>m.model==='pagoda').at=[-2.5,-2.5];
 assert.ok(registerMapPackage('draft:bad',inWater).some(e=>/water/.test(e)));
 assert.equal(MAP_PACKAGES['draft:bad'],undefined);
 assert.deepEqual(checkMapPackage(null),['地图包为空']);
});
test('landmark GLB assets must be served by this site',()=>{
 const ok=packageData('westlake'),m=ok.layout.landmarks[0];
 m.asset={kind:'glb',url:'/generated/abcdefgh-1234/model.glb',height:.9,source:'agent'};
 assert.deepEqual(checkMapPackage(ok,spotIds),[]);
 for(const url of ['https://evil.example/x.glb','/assets/../server.mjs.glb','/assets/x.js','//cdn/x.glb']){
  const p=packageData('westlake');p.layout.landmarks[0].asset={kind:'glb',url};
  assert.ok(checkMapPackage(p).length,url);
 }
});
test('portals stand in the neighbour direction, entered from the roaming edge',()=>{
 const home=[0,1.7,0],target=[0,1.7,-4],bounds={min:[-1.2,-.5,-2.5],max:[1.2,.4,.6]};
 const near=(a,b)=>a.every((v,i)=>Math.abs(v-b[i])<1e-9);
 // Heading 0: the start view looks north (-z). A neighbour due north is straight ahead; the box allows 2.5 m.
 let p=portalSpot(home,target,0,0,bounds);
 assert.ok(near(p.edge,[0,0,-2.5])&&near(p.at,[0,0,-3.5]),'gate 1 m beyond the walkable edge');
 p=portalSpot(home,target,0,90,bounds);// east = +x, box allows 1.2 m; gate keeps a minimum distance from the start
 assert.ok(near(p.edge,[1.2,0,0])&&near(p.at,[3.2,0,0]));
 p=portalSpot(home,target,0,180,bounds);// behind, box allows only .6 m
 assert.ok(near(p.edge,[0,0,.6])&&near(p.at,[0,0,3.2]));
 p=portalSpot(home,target,90,90,bounds);// start view faces east, east neighbour is straight ahead
 assert.ok(Math.abs(p.at[0])<1e-9&&p.at[2]<-3);
 assert.ok(near(portalSpot(home,target,0,0,null).edge,[0,0,-6]),'no box: capped at reach');
});
test('the guide answers "where next" from the map, and links mentioned neighbours',()=>{
 const nbs=[{id:'leifeng',name:'雷峰塔 · 夕照',dir:'东',minutes:12,boat:false},{id:'santan',name:'三潭印月',dir:'北',minutes:20,boat:true}];
 const a=nextAnswer(nbs);
 assert.equal(a.source,'map');assert.deepEqual(a.suggest,['leifeng','santan']);
 assert.match(a.text,/往东步行约 12 分钟到雷峰塔/);assert.match(nearbyText(nbs),/坐船/);
 assert.deepEqual(mentioned('可以先去雷峰塔看看',nbs),['leifeng']);
 assert.equal(nextAnswer([]).known,false);
});
test('publishing reports an imported map package',()=>{
 const state={draft:{title:'t',map:{},spots:[],mapPackage:{manifest:{}}},published:{title:'t',map:{},spots:[]}};
 assert.ok(draftChanges(state).some(c=>c.includes('三维底图')));
});
