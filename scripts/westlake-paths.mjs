// Snaps the hand-drawn walking routes onto land and prints a JSON network for geography.json.
// Usage: node scripts/westlake-paths.mjs
import {landField,walkable,PLACES as P,CAUSEWAYS,pointOnPolyline,distToPolyline} from '../src/westlake-geo.js';

const r2=([x,z])=>[Math.round(x*100)/100,Math.round(z*100)/100];
// Nearest point whose land value lies in [lo, hi] (a "shore road" band), searched on a small spiral.
function snap([x,z],lo=.18,hi=.7){
 const ok=(px,pz)=>{const l=landField(px,pz);return l>=lo&&l<=hi&&walkable(px,pz);};
 if(ok(x,z))return [x,z];
 for(let r=.05;r<4;r+=.05)for(let a=0;a<64;a++){const px=x+Math.cos(a/64*6.283)*r,pz=z+Math.sin(a/64*6.283)*r;if(ok(px,pz))return [px,pz];}
 if(hi<5)return snap([x,z],lo,9);
 throw Error('cannot snap '+x+','+z+' land='+landField(x,z).toFixed(2));
}
const clear=(a,b)=>{const n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.03);for(let i=0;i<=n;i++)if(!walkable(a[0]+(b[0]-a[0])*i/n,a[1]+(b[1]-a[1])*i/n))return false;return true;};
// Splits a segment until every piece stays on land.
function route(a,b,depth=0){
 if(clear(a,b)||depth>7)return [a,b];
 const m=snap([(a[0]+b[0])/2,(a[1]+b[1])/2]);return [...route(a,m,depth+1).slice(0,-1),...route(m,b,depth+1)];
}
const NODES={},EDGES=[];let n=0;
const node=(id,p)=>{NODES[id]=r2(p);return id;};
// A chain of waypoints: named stops are [id,[x,z]] (kept exactly), others are snapped and densified.
function chain(stops,{snapStops=true}={}){
 let prev=null,prevP=null;
 for(const s of stops){
  const [id,p0]=typeof s[0]==='string'?s:[null,s],p=id&&NODES[id]?NODES[id]:snapStops?snap(p0,.12,9):p0;
  const cur=id&&NODES[id]?id:node(id||'w'+(++n),p);
  if(prev){const pts=route(prevP,NODES[cur]);let last=prev;for(const q of pts.slice(1,-1)){const w=node('w'+(++n),q);EDGES.push([last,w]);last=w;}EDGES.push([last,cur]);}
  prev=cur;prevP=NODES[cur];
 }
}
const line=id=>CAUSEWAYS.find(c=>c.id===id).points;
// Stops along a causeway: its own vertices plus the named stops, ordered by position, so routes never cut corners.
const along=(id,named)=>{const pts=line(id),t=p=>distToPolyline(...p,pts).along;return [...pts.map(p=>[t(p),null,p]),...named.map(([n,tt])=>[tt,n,pointOnPolyline(pts,tt).slice(0,2)])].sort((a,b)=>a[0]-b[0]).filter((s,i,a)=>s[1]||!a.some(o=>o[1]&&Math.abs(o[0]-s[0])<.02)).map(([,n,p])=>n?[n,p]:p);};
const onSu=t=>pointOnPolyline(CAUSEWAYS[0].points,t).slice(0,2),onBai=t=>pointOnPolyline(CAUSEWAYS[1].points,t).slice(0,2);
// Bai causeway: Pinghu Qiuyue (Gushan's east tip) to the Broken Bridge.
chain([['ph',onBai(.02)],['baiM',onBai(.36)],['dq',onBai(.9)],['dqN',onBai(.99)]],{snapStops:false});
// North shore road (Beishan Street) back west to Yue Fei temple and the north end of the Su causeway.
chain([['dqN'],[1.5,-17.9],[-2.5,-16.9],[-6,-14.6],[-8.8,-12.3],['yue',[-10.6,-10.4]],['suN',onSu(.0)]]);
// Gushan's south shore, then Xiling bridge to the north-west shore.
chain([['ph'],[-3,-8.5],[-5.6,-8.7],['gsW',line('xiling')[0]]]);
chain([['gsW'],...line('xiling').slice(1,-1),['xlW',line('xiling').at(-1)]],{snapStops:false});
chain([['xlW'],['yue']]);
// Su causeway, north to south, one node per section between bridges.
chain([['suN'],...along('su',[['su1',.17],['su2',.24],['su3',.44],['su4',.63],['su5',.82],['suS',.985]]).filter((s,i)=>i>0)],{snapStops:false});
// Quyuan Fenghe, west of the causeway's north end, over the Jade Belt bridge.
chain([['su1'],...line('jinsha').slice(1,-1),['qy',line('jinsha').at(-1)]],{snapStops:false});
// Huagang Guanyu: west of the causeway's south end.
// The OSM viewpoint sits on the causeway's end; the stop is moved a little into the Huagang garden.
chain([['su5'],['hg',[-6.0,13.25]]]);
// South shore (Nanshan Road) to Leifeng, Changqiao and up the east shore (Hubin) back to the Broken Bridge.
chain([['suS'],[0,16.4],['lfBase',[2.3,14.9]],[5.5,16.2],['changq',[8.5,15.6]],[12.5,11],[14.6,5],['hubin',[15.3,0]],[15.2,-6],[12.5,-12.5],[9.4,-16.4],...line('shengtang'),[7.2,-18.15],['dqN']]);
chain([['lfBase'],['lf',[P.leifeng[0]+(NODES.lfBase[0]-P.leifeng[0])*.42,P.leifeng[1]+(NODES.lfBase[1]-P.leifeng[1])*.42]]],{snapStops:false});
// Piers and the boat routes to Xiaoyingzhou.
chain([['ph'],['phPier',[-1.6,-8.55]]]);
chain([['hubin'],['hubinPier',[14.75,-.4]]]);
chain([['hg'],['hgPier',[-4.3,12.2]]]);
chain([['stPier',line('jiuqu')[0]],['stMid',line('jiuqu')[1]],['st',line('jiuqu')[2]]],{snapStops:false});
EDGES.push(['hgPier','stPier','boat'],['hubinPier','stPier','boat'],['phPier','stPier','boat']);
const bad=Object.entries(NODES).filter(([,p])=>!walkable(...p)).map(([k])=>k);
console.log(JSON.stringify({nodes:NODES,edges:EDGES.map(([a,b,mode='walk'])=>({a,b,mode}))},null,2));
console.error('nodes',Object.keys(NODES).length,'edges',EDGES.length,'not walkable',bad.join(',')||'none');
