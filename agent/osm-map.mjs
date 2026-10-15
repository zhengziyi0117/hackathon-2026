// Generate a map package from a place name: Nominatim (where), Overpass (water, paths, sights), Open-Meteo (relief).
// buildPackage() is pure and deterministic, so it is tested with a fixture; generateMap() does the network calls.
// Only real OSM features become water, paths and spots. Hill height is exaggerated for display and says so.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {checkMapPackage} from '../src/map3d/packages.js';
import {createGeography} from '../src/map3d/geography.js';

const UA='jingjian-studio/0.1 (local scenic map editor; https://www.openstreetmap.org/copyright)';
const OVERPASS=['https://overpass-api.de/api/interpreter','https://maps.mail.ru/osm/tools/overpass/api/interpreter','https://overpass.private.coffee/api/interpreter'];
const fail=(status,message)=>Object.assign(Error(message),{status});
const r2=v=>Math.round(v*100)/100;
const MAX_SPOTS=8,HALF=22,SPAN_MIN=1200,SPAN_MAX=6000;

// ---- geometry helpers ----
const area=r=>Math.abs(r.reduce((s,p,i)=>{const q=r[(i+1)%r.length];return s+p[0]*q[1]-q[0]*p[1];},0))/2;
const centroid=r=>[r.reduce((s,p)=>s+p[0],0)/r.length,r.reduce((s,p)=>s+p[1],0)/r.length];
function inside([x,z],r){let c=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const [ax,az]=r[j],[bx,bz]=r[i];if((az>z)!==(bz>z)&&x<(bx-ax)*(z-az)/(bz-az)+ax)c=!c;}return c;}
const parity=(p,rings)=>rings.reduce((n,r)=>n+(inside(p,r)?1:0),0)%2===1;
function dp(pts,tol){
 if(pts.length<3)return pts;
 const [ax,az]=pts[0],[bx,bz]=pts.at(-1),L=Math.hypot(bx-ax,bz-az)||1e-9;let best=0,k=0;
 for(let i=1;i<pts.length-1;i++){const d=Math.abs((bx-ax)*(az-pts[i][1])-(ax-pts[i][0])*(bz-az))/L;if(d>best){best=d;k=i;}}
 return best<=tol?[pts[0],pts.at(-1)]:[...dp(pts.slice(0,k+1),tol).slice(0,-1),...dp(pts.slice(k),tol)];
}
function simplifyRing(r,tol){
 const open=Math.hypot(r[0][0]-r.at(-1)[0],r[0][1]-r.at(-1)[1])<1e-9?r.slice(0,-1):r;if(open.length<4)return open;
 const k=open.reduce((best,p,i)=>Math.hypot(p[0]-open[0][0],p[1]-open[0][1])>Math.hypot(open[best][0]-open[0][0],open[best][1]-open[0][1])?i:best,0);
 return [...dp(open.slice(0,k+1),tol).slice(0,-1),...dp([...open.slice(k),open[0]],tol).slice(0,-1)];
}
// Joins way pieces of a multipolygon into closed rings; open leftovers are dropped.
function joinRings(parts){
 const ways=parts.map(w=>[...w]),out=[],same=(a,b)=>Math.abs(a[0]-b[0])<1e-9&&Math.abs(a[1]-b[1])<1e-9;
 while(ways.length){
  let r=ways.shift(),grew=true;
  while(grew&&!same(r[0],r.at(-1))){grew=false;
   for(let i=0;i<ways.length;i++){const w=ways[i];
    if(same(r.at(-1),w[0]))r=[...r,...w.slice(1)];else if(same(r.at(-1),w.at(-1)))r=[...r,...[...w].reverse().slice(1)];
    else if(same(r[0],w.at(-1)))r=[...w.slice(0,-1),...r];else if(same(r[0],w[0]))r=[...[...w].reverse().slice(0,-1),...r];else continue;
    ways.splice(i,1);grew=true;break;}
  }
  if(same(r[0],r.at(-1))&&r.length>=4)out.push(r);
 }
 return out;
}

const isWater=t=>t.natural==='water'||t.waterway==='riverbank'||t.landuse==='reservoir'||t.landuse==='basin';
const ROADS=/^(footway|path|pedestrian|steps|track|service|living_street|residential|unclassified|tertiary|secondary|primary|cycleway|bridleway)$/;
const KIND=t=>t.place==='island'||t.place==='islet'?'岛屿':t.leisure?'园林':t.tourism==='viewpoint'?'观景点':t.tourism==='museum'?'博物馆':t.amenity==='place_of_worship'?'宗教场所':t.historic?'历史遗存':t.natural==='peak'?'山峰':'景点';
function score(t){return (t.wikidata||t.wikipedia?3:0)+(t.tourism==='attraction'?2:t.tourism==='museum'||t.tourism==='viewpoint'?1.5:0)+(t.historic&&t.historic!=='yes'?1.5:t.historic?1:0)+(t.amenity==='place_of_worship'?1.2:0)+(t.natural==='peak'?1:0)-(t.tourism==='artwork'||t.historic==='memorial'?1:0)+(t.leisure||t.place?.5:0);}
// Procedural model by name; the agent or staff refine it later.
function modelFor(name,t,u){
 if(/塔/.test(name))return {model:'pagoda',parameters:{tiers:/白塔|喇嘛/.test(name)?3:5}};
 if(/阁|楼/.test(name))return {model:'pagoda',parameters:{tiers:3,body:.36}};
 if(/桥/.test(name)||t.bridge)return {model:'arch-bridge',parameters:{}};
 if(/亭|榭|舫/.test(name))return {model:'pavilion',parameters:{}};
 if(/碑|铜牛|石|鼎|麒麟|雕/.test(name)||t.historic==='memorial'||t.historic==='monument'||t.tourism==='artwork')return {model:'stele-pavilion',parameters:{}};
 if(/殿|堂|寺|庙|宫|祠|馆|斋|园|苑|院|城关|门/.test(name)||t.amenity==='place_of_worship'||t.tourism==='museum')return {model:'palace-hall',parameters:{width:r2(Math.min(2.2,Math.max(.9,40/u))),depth:r2(Math.min(1.5,Math.max(.6,26/u))),height:.7}};
 return {model:'pavilion',parameters:{}};
}

// place: {id, name, center:[lon,lat], bbox:[s,n,w,e]}; osm: Overpass JSON; elevation: [{lon,lat,ele}] or null.
export function buildPackage({place,osm,elevation,fetched=''}){
 const warnings=[],[lon0,lat0]=place.center,[s,n,w,e]=place.bbox;
 const mLon=111320*Math.cos(lat0*Math.PI/180),mLat=110540;
 const spanM=Math.max((e-w)*mLon,(n-s)*mLat)*1.15,unitMeters=Math.max(10,Math.min(150,Math.round(spanM/(2*HALF)))),cell=unitMeters<40?.05:.1;
 const lonUnits=+(mLon/unitMeters).toFixed(2),latUnits=+(mLat/unitMeters).toFixed(2);
 const P=g=>[(g.lon-lon0)*lonUnits,-(g.lat-lat0)*latUnits];
 const bounds={minX:-HALF,maxX:HALF,minZ:-HALF,maxZ:HALF},inB=([x,z],pad=0)=>x>bounds.minX+pad&&x<bounds.maxX-pad&&z>bounds.minZ+pad&&z<bounds.maxZ-pad;
 const els=osm.elements||[],tags=x=>x.tags||{};
 const lineOf=x=>(x.geometry||[]).filter(Boolean).map(P);

 // Water: closed water ways plus assembled multipolygons. Larger rings first; an outer ring already inside water is a duplicate.
 const raw=[];
 for(const x of els){
  const t=tags(x);if(!isWater(t))continue;
  if(x.type==='way'){const r=lineOf(x);if(r.length>=4)raw.push({r,outer:true,name:t.name});}
  else if(x.type==='relation')for(const role of ['outer','inner'])for(const r of joinRings((x.members||[]).filter(m=>m.type==='way'&&(m.role||'outer')===role&&m.geometry).map(m=>m.geometry.filter(Boolean).map(P))))raw.push({r,outer:role==='outer',name:t.name});
 }
 const minArea=(25/unitMeters)**2*2,water=[],named=[];
 for(const c of raw.map(x=>({...x,a:area(x.r)})).filter(x=>x.a>=minArea).sort((a,b)=>b.a-a.a)){
  const r=simplifyRing(c.r,Math.max(.02,3/unitMeters)).map(p=>p.map(r2));if(r.length<3)continue;
  if(c.outer&&parity(centroid(r),water)&&!water.some(o=>inside(centroid(o),r)))continue;
  water.push(r);if(c.outer&&c.name)named.push({name:c.name,r,a:c.a});
 }
 if(!water.length)warnings.push('范围内没有找到水体，地图只有陆地。');

 // Relief from the DEM grid: one soft hill per sample above the lowest point, exaggerated ~4× for the miniature (overlapping bumps sum to ~1.6×).
 const hills=[];let maxHill=0;
 if(elevation?.length){
  const base=Math.min(...elevation.map(p=>p.ele)),spacing=2*HALF/(Math.sqrt(elevation.length)-1||1);
  for(const p of elevation){const rel=p.ele-base;if(rel<3)continue;const at=P(p).map(r2),height=r2(Math.min(5,rel*4/unitMeters)/1.6);if(height<.05||!inB(at,-2))continue;hills.push({at,radius:r2(spacing*.75),height});maxHill=Math.max(maxHill,height*1.8);}
 }else warnings.push('没有取到高程数据，地形按平地处理。');

 const geography={schemaVersion:1,id:place.id,name:place.name,
  frame:{origin:[+lon0.toFixed(6),+lat0.toFixed(6)],unitMeters,bounds,source:'© OpenStreetMap contributors, ODbL 1.0',axes:{x:'east',z:'south'},projection:{lonUnits,latUnits}},
  provenance:{attribution:'© OpenStreetMap contributors, ODbL 1.0',url:'https://www.openstreetmap.org/copyright',fetched:fetched||new Date().toISOString(),
   notes:[`由「${place.name}」自动生成：水体、道路和景点来自 OpenStreetMap，地形来自 Open-Meteo 高程（约 90 m 网格，竖向夸张约 4 倍）。`,'模型造型按名称自动选择，是示意，不代表实际建筑；景点需景区核对。']},
  water,places:{},causeways:[],bridge:{length:r2(Math.max(.3,30/unitMeters)),height:.12,gap:r2(Math.max(.1,10/unitMeters))},
  terrain:{cell,hills,westRidge:{startX:-1000,width:1,height:0,noise:0},city:{eastX:1000,eastWidth:1,northX:1000,northWidth:1,northZ:-1000,northDepth:1}},
  network:{nodes:{},edges:[]},spots:{}};
 const interaction={schemaVersion:1,id:place.id+'-interaction',mapId:place.id,startNode:'',defaultMood:'spring',
  avatar:{scale:1.45,keyboardSpeed:2.4,walkSpeed:2.6,boatSpeed:3.6,arrivalRadius:1.1},
  routing:{boatCostMultiplier:.8,walkMetersPerMinute:75,boatMetersPerMinute:150,straightSampleStep:.12},
  movement:{boundsPadding:.6,minLand:.04,maxTerrainHeight:r2(Math.max(3.8,maxHill+1))},
  camera:{fov:30,intro:{target:[0,0,0],distance:110,theta:-1.6,phi:.18},home:{target:[0,0,0],distance:78,theta:-.55,phi:.78},minDistance:6,maxDistance:90,minPhi:.32,maxPhi:1.3}};
 // Paths that dip into water (bridges, piers, shore paths the simplified shoreline cuts) become narrow land strips,
 // like West Lake's causeways. Only short crossings, or ones OSM tags as bridges, so open water stays open.
 const dry=createGeography(geography,interaction),stripW=r2(Math.max(.14,Math.min(.4,8/unitMeters))),maxRun=120/unitMeters;
 const roadWays=els.filter(x=>x.type==='way'&&ROADS.test(tags(x).highway||'')&&!/^(private|no)$/.test(tags(x).access||'')&&x.nodes?.length===x.geometry?.length);
 for(const x of roadWays){
  const pts=x.geometry.map(P),wet=pts.map(p=>inB(p)&&dry.landField(...p)<.15);
  for(let i=0;i<pts.length;i++){
   if(!wet[i])continue;let j=i;while(j+1<pts.length&&wet[j+1])j++;
   const run=pts.slice(Math.max(0,i-1),Math.min(pts.length,j+2)),len=run.reduce((s,p,k)=>k?s+Math.hypot(p[0]-run[k-1][0],p[1]-run[k-1][1]):0,0);
   const t=tags(x);if(run.length>=2&&len>.01&&(len<=maxRun||(t.bridge&&t.bridge!=='no')))geography.causeways.push({id:'br-'+x.id+'-'+i,name:t.name||'桥',width:stripW,minor:true,points:dp(run,.02).map(p=>p.map(r2)),bridges:[]});
   i=j;
  }
 }
 // Keep the cost of landField bounded; tagged bridges first, then the longest strips.
 if(geography.causeways.length>200){const len=c=>c.points.reduce((s,p,k)=>k?s+Math.hypot(p[0]-c.points[k-1][0],p[1]-c.points[k-1][1]):0,0);geography.causeways.sort((a,b)=>(b.name!=='桥')-(a.name!=='桥')||len(b)-len(a)).length=200;}
 const probe=createGeography(geography,interaction);

 // Path network: OSM junctions and endpoints become nodes; every kept segment is sampled like the validator does.
 const ways=roadWays;
 const uses=new Map();for(const x of ways)x.nodes.forEach((id,i)=>uses.set(id,(uses.get(id)||0)+(i===0||i===x.nodes.length-1?2:1)));
 const nodes={},edges=[],key=new Set(),at=new Map(),tol=Math.max(.02,2/unitMeters);
 const walkLine=(a,b)=>{const n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.03));for(let i=0;i<=n;i++)if(!probe.walkable(a[0]+(b[0]-a[0])*i/n,a[1]+(b[1]-a[1])*i/n))return false;return true;};
 const addEdge=(a,b)=>{if(a===b)return;const k=a<b?a+'|'+b:b+'|'+a;if(key.has(k))return;key.add(k);edges.push({a,b,mode:'walk'});};
 for(const x of ways){
  // A closed way (loop path) starts and ends at one point; break it in the middle too, or simplification collapses it.
  const pts=x.geometry.map(P),mid=x.nodes[0]===x.nodes.at(-1)?Math.floor(pts.length/2):-1;let start=0;
  for(let i=1;i<pts.length;i++){
   if(uses.get(x.nodes[i])<2&&i<pts.length-1&&i!==mid)continue;
   // Simplify the stretch between two junctions; kept vertices become nodes too, so edges follow the path.
   const seg=pts.slice(start,i+1),idx=seg.map((_,k)=>start+k),keep=new Set(dp(seg.map((p,k)=>[...p,k]),tol).map(p=>p[2]));
   const chain=idx.filter((_,k)=>keep.has(k));
   for(let c=1;c<chain.length;c++){
    // Check the rounded coordinates that will be stored, so the validator sees exactly what was tested.
    const [ia,ib]=[chain[c-1],chain[c]],A=pts[ia].map(r2),B=pts[ib].map(r2);
    if(!inB(A,.7)||!inB(B,.7)||!walkLine(A,B))continue;
    // OSM nodes that round to the same spot share one map node, so no edge has zero length.
    const a=at.get(A+'')||'n'+x.nodes[ia],b=at.get(B+'')||'n'+x.nodes[ib];if(a===b)continue;
    nodes[a]=A;nodes[b]=B;at.set(A+'',a);at.set(B+'',b);addEdge(a,b);
   }
   start=i;
  }
 }
 // Largest connected piece only: v1 maps require every spot to reach every other spot.
 const adj={};for(const {a,b} of edges){(adj[a]||=[]).push(b);(adj[b]||=[]).push(a);}
 let best=[];const seen=new Set();
 for(const id of Object.keys(adj)){if(seen.has(id))continue;const comp=[],q=[id];seen.add(id);while(q.length){const u=q.pop();comp.push(u);for(const v of adj[u])if(!seen.has(v)){seen.add(v);q.push(v);}}if(comp.length>best.length)best=comp;}
 if(best.length<2)throw fail(422,'这个范围里没有找到可连通的步行道路，暂时生成不了。可以换一个更具体的景区名称。');
 const inBest=new Set(best);
 geography.network.nodes=Object.fromEntries(Object.entries(nodes).filter(([id])=>inBest.has(id)));
 geography.network.edges=edges.filter(x=>inBest.has(x.a));
 contract(geography.network,walkLine);
 if(Object.keys(geography.network.nodes).length>1500)warnings.push('道路很密，已只保留主要连通路网。');
 // Nearest stop for a sight: an existing node, or a new node where the sight projects onto a path (the edge is split there).
 const net=geography.network;let split=0;
 const nearest=([x,z])=>{
  let best={id:null,d:Infinity};for(const [id,p] of Object.entries(net.nodes)){const d=Math.hypot(p[0]-x,p[1]-z);if(d<best.d)best={id,d};}
  let edge=null;
  for(const ed of net.edges){const A=net.nodes[ed.a],B=net.nodes[ed.b],ex=B[0]-A[0],ez=B[1]-A[1],L=ex*ex+ez*ez;if(!L)continue;
   const t=Math.max(0,Math.min(1,((x-A[0])*ex+(z-A[1])*ez)/L)),q=[A[0]+ex*t,A[1]+ez*t].map(r2),d=Math.hypot(q[0]-x,q[1]-z);
   if(d<best.d-.3&&(!edge||d<edge.d))edge={ed,q,d};}
  if(!edge)return best;
  const {ed,q}=edge,A=net.nodes[ed.a],B=net.nodes[ed.b];
  if(Math.hypot(q[0]-A[0],q[1]-A[1])<.05||Math.hypot(q[0]-B[0],q[1]-B[1])<.05||!walkLine(A,q)||!walkLine(q,B))return best;
  const id='s'+(++split);net.nodes[id]=q;net.edges.splice(net.edges.indexOf(ed),1,{a:ed.a,b:id,mode:'walk'},{a:id,b:ed.b,mode:'walk'});
  return {id,d:edge.d};
 };

 // Spots: named sights inside the frame, best first, deduplicated by name and spaced apart, each tied to a reachable node.
 const pointOf=x=>x.type==='node'?P(x):x.bounds?P({lon:(x.bounds.minlon+x.bounds.maxlon)/2,lat:(x.bounds.minlat+x.bounds.maxlat)/2}):x.geometry?.length?centroid(lineOf(x)):null;
 const candidates=new Map(),waterNames=new Set(named.map(x=>x.name));
 for(const x of els){const t=tags(x);if(!t.name||t.name===place.name||isWater(t)||waterNames.has(t.name))continue;
  if(!(t.tourism&&/^(attraction|viewpoint|museum|artwork)$/.test(t.tourism))&&!t.historic&&t.amenity!=='place_of_worship'&&t.natural!=='peak'&&!/^(park|garden)$/.test(t.leisure||'')&&!/^(island|islet)$/.test(t.place||''))continue;
  const at=pointOf(x);if(!at||!inB(at,1.5))continue;
  const c={id:(x.type[0]+x.id),name:t.name.slice(0,30),tags:t,at:at.map(r2),score:score(t)};
  const prev=candidates.get(c.name);if(!prev||c.score>prev.score)candidates.set(c.name,c);}
 const spots=[],labels=[],landmarks=[],gap=Math.max(1.2,60/unitMeters);
 for(const c of [...candidates.values()].sort((a,b)=>b.score-a.score)){
  if(spots.length>=MAX_SPOTS)break;
  if(c.tags.natural==='peak'){labels.push({text:c.name,at:c.at,kind:'hill',lift:.5});continue;}
  if(spots.some(o=>Math.hypot(o.at[0]-c.at[0],o.at[1]-c.at[1])<gap))continue;
  const node=nearest(c.at);if(!node.id||node.d>Math.max(2.5,150/unitMeters))continue;
  const {model,parameters}=modelFor(c.name,c.tags,unitMeters),wet=probe.landField(...c.at)<0;
  // Land models may not stand in water; move them to their stop.
  const at=wet&&model!=='arch-bridge'?geography.network.nodes[node.id]:c.at;
  const np=geography.network.nodes[node.id];
  spots.push({...c,node:node.id});geography.places[c.id]=c.at;
  geography.spots[c.id]={node:node.id,label:c.at,scene:`${place.name} · ${KIND(c.tags)}`,season:'spring'};
  landmarks.push({id:c.id,model,at,rotation:r2(Math.atan2(np[0]-at[0],np[1]-at[1])||0),scale:1,lift:0,spotId:c.id,parameters});
 }
 if(!spots.length)throw fail(422,'这个范围里没有找到带名称的景点（OSM 的 tourism / historic 标签），暂时生成不了。');
 for(const n of named.slice(0,4)){const at=centroid(n.r).map(r2);if(inB(at,2)&&probe.landField(...at)<0&&!labels.some(l=>l.text===n.name))labels.push({text:n.name,at,kind:'lake',lift:.3});}
 for(const l of labels)if(l.kind==='hill')geography.places['peak-'+labels.indexOf(l)]=l.at;

 interaction.startNode=spots[0].node;
 const [cx,cz]=[spots.reduce((s,p)=>s+p.at[0],0)/spots.length,spots.reduce((s,p)=>s+p.at[1],0)/spots.length].map(r2);
 interaction.camera.home.target=[cx,0,cz];
 const biggest=water[0]&&centroid(water[0]);
 const layout={schemaVersion:1,id:place.id+'-layout',mapId:place.id,catalogVersion:1,landmarks,labels:labels.slice(0,10),
  vegetation:{seed:11,attempts:9000,islands:[]},city:{seed:5},
  lotus:{at:biggest?biggest.map(r2):[0,0],seed:3,attempts:biggest?600:1,maxPads:biggest?80:1},boatLoops:[],
  quality:{terrainSegments:230,landTextureResolution:384,shadowMapSize:4096}};
 const manifest={schemaVersion:1,id:place.id,name:place.name,geography:'./geography.json',layout:'./layout.json',interaction:'./interaction.json',styles:['miniature','papercraft','voxel','bricks','adventure'],defaultStyle:'miniature'};
 const pkg={manifest,geography,layout,interaction};
 const errors=checkMapPackage(pkg);
 if(errors.length)throw Object.assign(fail(422,'自动生成的地图没有通过校验：'+errors.slice(0,3).join('；')),{pkg});
 return {pkg,spots:spots.map(s=>({id:s.id,name:s.name,kind:KIND(s.tags),x:r2((s.at[0]-bounds.minX)/(2*HALF)),y:r2((s.at[1]-bounds.minZ)/(2*HALF))})),warnings,
  stats:{waterRings:water.length,nodes:Object.keys(geography.network.nodes).length,edges:geography.network.edges.length,spots:spots.length,hills:hills.length,unitMeters}};
}

// Dense networks: drop every other degree-2 vertex when the shortcut between its neighbours is still walkable.
function contract(net,walkLine){
 if(Object.keys(net.nodes).length<=600)return;
 const adj={};for(const x of net.edges){(adj[x.a]||=[]).push(x.b);(adj[x.b]||=[]).push(x.a);}
 const k=(a,b)=>a<b?a+'|'+b:b+'|'+a,have=new Set(net.edges.map(x=>k(x.a,x.b))),drop=new Set();
 for(const [id,list] of Object.entries(adj)){
  if(list.length!==2)continue;const [u,v]=list;
  if(drop.has(u)||drop.has(v)||have.has(k(u,v))||!walkLine(net.nodes[u],net.nodes[v]))continue;
  drop.add(id);have.add(k(u,v));
 }
 const edges=net.edges.filter(x=>!drop.has(x.a)&&!drop.has(x.b));
 for(const id of drop){const [u,v]=adj[id];edges.push({a:u,b:v,mode:'walk'});delete net.nodes[id];}
 net.edges=edges;
}

// ---- network side ----
let lastNominatim=0;
async function nominatim(path){
 // Nominatim usage policy: at most one request per second, with an identifying User-Agent.
 const wait=lastNominatim+1100-Date.now();if(wait>0)await new Promise(r=>setTimeout(r,wait));lastNominatim=Date.now();
 const r=await fetch('https://nominatim.openstreetmap.org/'+path,{headers:{'User-Agent':UA,'Accept-Language':'zh-CN,zh'},signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw fail(502,'地名搜索服务返回 HTTP '+r.status);return r.json();
}
const GOOD=new Set(['tourism','historic','natural','leisure','water','landuse','boundary']),POOR=/^(railway|highway|shop|office|building|place|amenity:(?!place_of_worship)|boundary:administrative|landuse:(residential|commercial|industrial|retail))/;
export async function searchPlaces(q){
 q=String(q||'').trim().slice(0,80);if(!q)throw fail(400,'请输入景区名称。');
 const find=async text=>(await nominatim('search?format=jsonv2&limit=10&q='+encodeURIComponent(text))).filter(x=>!POOR.test(x.category+':'+x.type)&&(x.osm_type!=='node'||GOOD.has(x.category)||x.type==='place_of_worship'));
 // A bare name often only matches a station of the same name; the park or scenic area usually carries a suffix.
 // Nominatim also returns transliterated look-alikes (圆明园 → 明円公園); keep results whose name contains the query.
 const own=list=>list.filter(x=>String(x.name||'').includes(q)||q.includes(String(x.name||'-')));
 let list=own(await find(q));for(const suffix of ['公园','景区','遗址公园'])if(!list.length&&!q.endsWith(suffix))list=own(await find(q+suffix));
 return list.slice(0,5).map(x=>({osm:x.osm_type[0].toUpperCase()+x.osm_id,name:x.name||q,kind:x.type,address:String(x.display_name||'').split(', ').slice(1).filter(t=>!/^\d+$/.test(t)).slice(0,3).join(' · '),center:[+x.lon,+x.lat],bbox:x.boundingbox.map(Number)}));
}
// Public Overpass servers are often busy: try each mirror once, and cache answers so a retry of the same place is instant.
async function overpass(query,cacheDir){
 const file=cacheDir&&path.join(cacheDir,createHash('sha256').update(query).digest('hex').slice(0,24)+'.json');
 if(file)try{return JSON.parse(await readFile(file,'utf8'));}catch{}
 let last;
 for(const url of OVERPASS){
  try{const r=await fetch(url,{method:'POST',headers:{'User-Agent':UA,'Content-Type':'application/x-www-form-urlencoded'},body:'data='+encodeURIComponent(query),signal:AbortSignal.timeout(40000)});
   const text=await r.text();
   if(r.ok&&text.trimStart().startsWith('{')){if(file){await mkdir(cacheDir,{recursive:true});await writeFile(file,text);}return JSON.parse(text);}
   last='HTTP '+r.status;}
  catch(err){last=err.name==='TimeoutError'?'超时':err.message;}
 }
 throw fail(502,'地图数据服务（Overpass）暂时繁忙：'+last+'。稍后再试一次。');
}
async function elevationGrid([s,n,w,e]){
 const k=10,pts=[];for(let i=0;i<k;i++)for(let j=0;j<k;j++)pts.push({lat:s+(n-s)*i/(k-1),lon:w+(e-w)*j/(k-1)});
 try{const r=await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${pts.map(p=>p.lat.toFixed(5))}&longitude=${pts.map(p=>p.lon.toFixed(5))}`,{signal:AbortSignal.timeout(20000)});
  const d=await r.json();if(!Array.isArray(d.elevation))return null;return pts.map((p,i)=>({...p,ele:d.elevation[i]}));}catch{return null;}
}
// data: {osm:"W29228773", mapId?}. Returns {pkg, spots, warnings, stats}.
export async function generateMap(data,cacheDir){
 const osm=/^([NWR])(\d{1,12})$/.exec(String(data.osm||''));if(!osm)throw fail(400,'请先选择一个地点。');
 const [hit]=await nominatim('lookup?format=jsonv2&osm_ids='+osm[1]+osm[2]);if(!hit)throw fail(404,'找不到这个地点。');
 const center=[+hit.lon,+hit.lat],mLon=111320*Math.cos(center[1]*Math.PI/180),mLat=110540;
 let [s,n,w,e]=hit.boundingbox.map(Number);const warnings=[];
 // Keep the frame between ~1.2 km and 6 km: points get a neighbourhood, cities are cut to their centre.
 const halfLat=Math.min(SPAN_MAX,Math.max(SPAN_MIN,(n-s)*mLat))/2/mLat,halfLon=Math.min(SPAN_MAX,Math.max(SPAN_MIN,(e-w)*mLon))/2/mLon;
 if((n-s)*mLat>SPAN_MAX||(e-w)*mLon>SPAN_MAX)warnings.push('范围太大，只取了中心约 6 公里。');
 const cy=(s+n)/2,cx=(w+e)/2;[s,n,w,e]=[cy-halfLat,cy+halfLat,cx-halfLon,cx+halfLon];
 const b=`(${s.toFixed(5)},${w.toFixed(5)},${n.toFixed(5)},${e.toFixed(5)})`;
 const query=`[out:json][timeout:60];(way["natural"="water"]${b};relation["natural"="water"]${b};way["waterway"="riverbank"]${b};way["landuse"="reservoir"]${b};way["highway"]${b};nwr["name"]["tourism"~"^(attraction|viewpoint|museum|artwork)$"]${b};nwr["name"]["historic"]${b};nwr["name"]["amenity"="place_of_worship"]${b};node["name"]["natural"="peak"]${b};nwr["name"]["leisure"~"^(park|garden)$"]${b};nwr["name"]["place"~"^(island|islet)$"]${b};);out geom;`;
 const [data2,elevation]=await Promise.all([overpass(query,cacheDir),elevationGrid([s,n,w,e])]);
 const id=/^[a-z][a-z0-9-]*$/.test(data.mapId||'')?data.mapId:'osm-'+osm[1].toLowerCase()+osm[2];
 const out=buildPackage({place:{id,name:String(hit.name||hit.display_name||'景区').slice(0,40),center:[(w+e)/2,(s+n)/2],bbox:[s,n,w,e]},osm:data2,elevation,fetched:data2.osm3s?.timestamp_osm_base||''});
 return {...out,warnings:[...warnings,...out.warnings],name:out.pkg.manifest.name};
}
