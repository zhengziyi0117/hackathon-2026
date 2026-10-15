import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPackage} from '../agent/osm-map.mjs';
import {checkMapPackage} from '../src/map3d/packages.js';
import {createGeography} from '../src/map3d/geography.js';

// Synthetic OSM extract: a square lake, a footway around it, a pier into the water, a few named sights.
const lat0=30,lon0=120,mLon=111320*Math.cos(lat0*Math.PI/180),mLat=110540;
const g=(x,y)=>({lon:lon0+x/mLon,lat:lat0+y/mLat});
const square=(r,ids)=>[[-r,-r],[r,-r],[r,r],[-r,r],[-r,-r]].map(([x,y],i)=>({...g(x,y),id:ids?ids[i%4]:undefined}));
const loop=square(380,[1,2,3,4]);
// A wood on the far side of the footway ring, and a row of built-up landuse boxes east of the park.
const at=(cx,cz,r)=>[[cx-r,cz-r],[cx+r,cz-r],[cx+r,cz+r],[cx-r,cz+r],[cx-r,cz-r]].map(([x,y])=>g(x,y));
const osm={elements:[
 {type:'way',id:10,tags:{natural:'water',water:'lake',name:'镜湖'},geometry:square(300)},
 {type:'way',id:20,tags:{highway:'footway'},nodes:loop.map(p=>p.id),geometry:loop.map(({lon,lat})=>({lon,lat}))},
 {type:'way',id:21,tags:{highway:'footway',bridge:'yes'},nodes:[1,5],geometry:[g(-380,-380),g(-250,-250)]},
 {type:'way',id:40,tags:{natural:'wood'},geometry:at(500,500,120)},
 ...[0,1,2,3,4,5].map(i=>({type:'way',id:50+i,tags:{landuse:'residential'},geometry:at(500,-500+i*200,100)})),
 {type:'node',id:30,...g(380,0),tags:{name:'镜湖塔',tourism:'attraction',wikidata:'Q1'}},
 {type:'node',id:31,...g(-380,0),tags:{name:'清音殿',historic:'building'}},
 {type:'node',id:32,...g(0,420),tags:{name:'北山',natural:'peak'}},
 {type:'node',id:33,...g(0,-380),tags:{name:'镜湖站',railway:'station'}},
]};
const place={id:'osm-test',name:'镜湖公园',center:[lon0,lat0],bbox:[lat0-600/mLat,lat0+600/mLat,lon0-600/mLon,lon0+600/mLon]};
const elevation=[];for(let i=0;i<10;i++)for(let j=0;j<10;j++){const p=g(-600+j*133,-600+i*133);elevation.push({...p,ele:10+Math.max(0,60-Math.hypot(j*133-600,i*133-1020)/6)});}

test('builds a valid package from OSM: real water, walkable paths, named sights with matching models',()=>{
 const r=buildPackage({place,osm,elevation});
 assert.deepEqual(checkMapPackage(r.pkg),[]);
 assert.deepEqual(r.spots.map(s=>s.name).sort(),['清音殿','镜湖塔']);
 const model=Object.fromEntries(r.pkg.layout.landmarks.map(m=>[r.spots.find(s=>s.id===m.spotId).name,m.model]));
 assert.equal(model['镜湖塔'],'pagoda');assert.equal(model['清音殿'],'palace-hall');
 assert.equal(r.pkg.geography.water.length,1);
 assert.ok(r.pkg.layout.labels.some(l=>l.text==='北山'&&l.kind==='hill')&&r.pkg.layout.labels.some(l=>l.text==='镜湖'&&l.kind==='lake'));
 assert.ok(r.pkg.geography.causeways.length>=1,'the pier into the lake becomes a land strip');
 assert.ok(r.pkg.geography.terrain.hills.length>0);
 assert.ok(r.pkg.layout.vegetation.islands.length>0,'the wood becomes a cluster of trees');
 assert.ok(r.pkg.layout.boatLoops.length>0,'a boat loop on the lake');
 assert.ok(r.pkg.geography.terrain.city.eastX<1000,'built-up land east of the park switches the town on');
 const geo=createGeography(r.pkg.geography,r.pkg.interaction),[a,b]=r.spots.map(s=>r.pkg.geography.spots[s.id].node);
 assert.ok(geo.shortestPath(a,b),'spots are connected');
 assert.ok(r.spots.every(s=>s.x>0&&s.x<1&&s.y>0&&s.y<1));
});
test('no water is not invented, and missing roads or sights are clear errors',()=>{
 const dry={elements:osm.elements.filter(x=>x.id!==10)};
 const r=buildPackage({place,osm:dry,elevation:null});
 assert.equal(r.pkg.geography.water.length,0);assert.equal(r.pkg.layout.pond,undefined);
 assert.ok(r.warnings.some(w=>w.includes('水体'))&&r.warnings.some(w=>w.includes('高程')));
 assert.throws(()=>buildPackage({place,osm:{elements:osm.elements.filter(x=>!x.tags?.highway)},elevation:null}),/步行道路/);
 assert.throws(()=>buildPackage({place,osm:{elements:osm.elements.filter(x=>x.type!=='node')},elevation:null}),/景点/);
});
