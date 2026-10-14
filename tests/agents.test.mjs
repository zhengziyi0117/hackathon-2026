import test from 'node:test';
import assert from 'node:assert/strict';
import {createScenicState,newScenic,newSpot,draftChanges,publishScenic} from '../src/scenic-core.js';
import {runGeo,runScript,runTrip,runQA,tripOf,untraced,helperInput} from '../src/scenic-agents.js';
import {geoFor} from '../src/geo-registry.js';
import {NODES,EDGES,walkable,neighboursOf,shortestPath,routeTime,SPOT_GEO} from '../src/westlake-geo.js';
const G=geoFor('westlake');

test('map calibration places every built-in spot on the lake with neighbours and the pilot heading',()=>{
  const {draft}=createScenicState(),geo=runGeo(draft,G);
  assert.equal(geo.spots.length,6);
  for(const g of geo.spots){
    assert.ok(g.matched,g.id);assert.ok(g.lon>120.12&&g.lon<120.16&&g.lat>30.22&&g.lat<30.27,g.id);
    assert.equal(g.neighbours.length,3);for(const n of g.neighbours)assert.ok(n.meters>0&&n.minutes>=3&&n.dir);
  }
  const hg=geo.spots.find(g=>g.id==='huagang');assert.equal(hg.has3D,true);assert.equal(hg.heading,20);
  draft.spots[0].heading=35;assert.equal(runGeo(draft,G).spots[0].heading,35);
  const s=newSpot('x1');s.name='新景点';draft.spots.push(s);assert.equal(runGeo(draft,G).spots.at(-1).matched,false);
  assert.deepEqual(runGeo(draft,null).spots.map(g=>g.matched),draft.spots.map(()=>false));
});
test('narration is made only of the material and computed lines, and edits that add facts are caught',()=>{
  const {draft}=createScenicState(),geo=runGeo(draft,G),out=runScript(draft,geo);
  for(const r of out.spots){
    const s=draft.spots.find(x=>x.id===r.id),g=geo.spots.find(x=>x.id===r.id);
    assert.ok(r.sentences.every(x=>['name','guide','description','geo','notice'].includes(x.from)));
    assert.deepEqual(untraced(r.text,s,g),[],r.id);
  }
  const s=draft.spots[0],g=geo.spots[0],r=out.spots[0];
  assert.deepEqual(untraced(r.text+'这里每天下午有喂鱼表演。',s,g),['这里每天下午有喂鱼表演。']);
  s.guide='';assert.ok(runScript(draft,geo).spots[0].sentences.some(x=>x.from==='description'));
  s.notice='今日御碑亭周边施工';assert.ok(runScript(draft,geo).spots[0].text.includes('提醒一句：今日御碑亭周边施工。'));
});
test('the itinerary visits every chosen spot once, in the quickest order, from the eastern spot by default',()=>{
  const {draft}=createScenicState(),t=runTrip(draft,{},G);
  assert.equal(t.order.length,6);assert.equal(new Set(t.order).size,6);assert.equal(t.start,'duanqiao');
  t.legs.forEach((l,i)=>{assert.equal(l.from,t.order[i]);assert.equal(l.to,t.order[i+1]);});
  assert.equal(t.totalMinutes,t.travelMinutes+t.stay*6);
  const picked=runTrip(draft,{include:['leifeng','huagang','santan'],start:'santan',stay:10,title:'湖南岸'},G);
  assert.deepEqual(picked.order[0],'santan');assert.equal(picked.order.length,3);assert.equal(picked.title,'湖南岸');assert.equal(picked.totalMinutes,picked.travelMinutes+30);
  assert.ok(runTrip(draft,{include:['leifeng']},G).problem);assert.ok(runTrip(draft,{},null).problem);
  assert.equal(tripOf(runTrip(draft,{include:[]},G)),null);
});
test('quality checks block what publishing blocks and flag stale or untraceable narration',()=>{
  const {draft}=createScenicState(),geo=runGeo(draft,G),r=runScript(draft,geo).spots[0],s=draft.spots[0];
  s.narration={text:r.text,basis:r.basis};
  assert.equal(runQA(draft,G).warn,0);
  s.guide+='园中还有一座小桥。';
  assert.ok(runQA(draft,G).checks.some(c=>c.level==='warn'&&c.helper==='script'&&c.text.includes('重新生成')));
  s.narration.text+='这里每天下午有喂鱼表演。';
  assert.ok(runQA(draft,G).checks.some(c=>c.text.includes('喂鱼表演')));
  draft.trip=tripOf(runTrip(draft,{},G));draft.spots.pop();
  assert.ok(runQA(draft,G).checks.some(c=>c.helper==='trip'&&c.level==='warn'));
  const other=newScenic('灵隐',{url:'idb:m',name:'m',custom:true}),q=runQA(other.draft,null);
  assert.ok(q.block>0);assert.ok(q.checks.some(c=>c.text.includes('3D 地图底图')));
});
test('publishing lists adopted narration, headings and the itinerary as their own changes',()=>{
  const state=createScenicState();state.draft=structuredClone(state.published);
  state.draft.spots[1].narration={text:'这里是断桥。',basis:'x'};state.draft.spots[0].heading=30;
  state.draft.trip=tripOf(runTrip(state.draft,{},G));
  assert.deepEqual(draftChanges(state),['花港观鱼 · 御碑亭：3D 场景朝向已调整','断桥：讲解稿已更新','更新了行程卡「西湖 · 六景慢游」']);
  publishScenic(state);assert.deepEqual(draftChanges(state),[]);assert.equal(state.published.trip.order.length,6);
  assert.notEqual(helperInput(state.draft,'geo'),helperInput({...state.draft,spots:[]},'geo'));
});
test('the West Lake path network stays on land and every spot reaches every other',()=>{
  for(const [id,[x,z]] of Object.entries(NODES))assert.ok(walkable(x,z),'node '+id);
  for(const e of EDGES){
    if(e.mode==='boat')continue;
    const [ax,az]=NODES[e.a],[bx,bz]=NODES[e.b],n=Math.ceil(Math.hypot(bx-ax,bz-az)/.05);
    for(let i=0;i<=n;i++)assert.ok(walkable(ax+(bx-ax)*i/n,az+(bz-az)*i/n),`edge ${e.a}-${e.b} leaves the land`);
  }
  const ids=Object.keys(SPOT_GEO);
  for(const a of ids)for(const b of ids)if(a!==b)assert.ok(shortestPath(SPOT_GEO[a].node,SPOT_GEO[b].node),a+'→'+b);
  for(const n of neighboursOf('huagang',ids,5))assert.equal(n.minutes,Math.max(3,routeTime(shortestPath(SPOT_GEO.huagang.node,SPOT_GEO[n.id].node)).minutes));
});
