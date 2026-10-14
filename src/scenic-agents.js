// Studio production helpers. Each reads the draft and returns a result the staff review, edit and adopt into the draft.
// They are rule-based and local: they compute from the map data or reorder the staff's own material, never adding facts.
import {publishProblems,worldAsset} from './scenic-core.js';

export const HELPERS=[
 {id:'geo',name:'地图校准',icon:'map-pinned',does:'把景点对到 3D 地图上，给出经纬度、邻近景点和场景朝向'},
 {id:'script',name:'讲解稿',icon:'mic',does:'用讲解资料和邻近景点排一段可朗读的讲解，每句注明出处'},
 {id:'trip',name:'行程卡',icon:'route',does:'按步行与游船路网排出游览顺序、距离和用时'},
 {id:'qa',name:'质检',icon:'shield-check',does:'发布前核对图片来源、AI 标记、讲解出处、朝向和行程'},
];
export const SOURCE_LABEL={name:'景点名称',guide:'讲解资料',description:'游客介绍',geo:'地图计算',notice:'运营提示'};
const short=name=>String(name||'').split(' · ')[0];
const sentences=text=>String(text||'').split(/(?<=[。！？])/).map(x=>x.trim()).filter(Boolean);
const plain=text=>String(text||'').replace(/[\s，。！？、；：“”‘’"'（）()《》·,.!?;:—-]/g,'');
function hash(text){let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(36);}

// G is the scenic's geometry module from geo-registry.js, or null when the scenic has no 3D map yet.
// Map calibration: where each spot sits in that geometry, and who its neighbours are.
export function runGeo(draft,G){
 const ids=draft.spots.map(s=>s.id),nameOf=id=>short(draft.spots.find(s=>s.id===id)?.name);
 return {base:Boolean(G),spots:draft.spots.map(s=>{
  const g=G?.SPOT_GEO[s.id];
  if(!g)return {id:s.id,matched:false};
  const [lon,lat]=G.toLonLat(g.label);
  return {id:s.id,matched:true,scene:g.scene,at:g.label.map(v=>+v.toFixed(2)),lon:+lon.toFixed(5),lat:+lat.toFixed(5),
   has3D:Boolean(worldAsset(s)),heading:Number.isFinite(s.heading)?s.heading:(g.heading??null),
   neighbours:G.neighboursOf(s.id,ids,3).map(n=>({id:n.id,name:nameOf(n.id),dir:G.compassName(n.bearing),bearing:n.bearing,meters:n.meters,minutes:n.minutes,boat:n.boat}))};
 })};
}

const neighbourLine=n=>n.boat?`从这里往${n.dir}走到码头坐船，约 ${n.minutes} 分钟可以到${n.name}。`:`从这里往${n.dir}步行约 ${n.minutes} 分钟，可以到${n.name}。`;
const nameLine=s=>`这里是${short(s.name)}。`;
const noticeLine=s=>'提醒一句：'+s.notice.trim().replace(/[。！？]?$/,'。');
// What a narration was built from; when this changes the adopted narration is out of date.
export const scriptBasis=(s,g)=>hash([s.name,s.guide,s.description,s.notice,JSON.stringify((g?.neighbours||[]).slice(0,2))].join('|'));

// Narration: the staff's guide material (or the visitor intro when there is none), then the nearest spots, then the notice.
export function runScript(draft,geo){
 return {spots:draft.spots.map(s=>{
  const g=geo.spots.find(x=>x.id===s.id),out=[],seen=new Set();
  const add=(text,from)=>{const k=plain(text);if(k&&!seen.has(k)){seen.add(k);out.push({text,from});}};
  add(nameLine(s),'name');
  const guide=sentences(s.guide);
  if(guide.length)guide.slice(0,4).forEach(t=>add(t,'guide'));else sentences(s.description).slice(0,2).forEach(t=>add(t,'description'));
  (g?.neighbours||[]).slice(0,2).forEach(n=>add(neighbourLine(n),'geo'));
  if(s.notice?.trim())add(noticeLine(s),'notice');
  return {id:s.id,sentences:out,text:out.map(x=>x.text).join(''),basis:scriptBasis(s,g)};
 })};
}
// Sentences of an (edited) narration that cannot be found in the spot's material or the computed lines.
export function untraced(text,s,g){
 const known=[s.guide,s.description,s.notice&&noticeLine(s),nameLine(s),...(g?.neighbours||[]).map(neighbourLine)].map(plain).join('|');
 return sentences(text).filter(t=>{const k=plain(t);return k&&!known.includes(k);});
}

// Itinerary: every order of the chosen spots is tried; the quickest one wins. Start defaults to the spot nearest Hubin (east).
const CN=['','一','两','三','四','五','六','七','八','九','十'];
function leg(G,a,b){
 const r=G.shortestPath(G.SPOT_GEO[a].node,G.SPOT_GEO[b].node);if(!r)return null;
 const {walk,boat,minutes}=G.routeTime(r);
 return {from:a,to:b,meters:Math.round((walk+boat)/10)*10,boatMeters:Math.round(boat/10)*10,minutes,path:r.nodes.map(n=>G.NODES[n].map(v=>+v.toFixed(2)))};
}
function orders(items){if(items.length<2)return [items];return items.flatMap((x,i)=>orders(items.filter((_,j)=>j!==i)).map(o=>[x,...o]));}
export function runTrip(draft,opts,G){
 opts||={};
 if(!G)return {problem:'这个景区还没有 3D 地图底图，暂时排不了路线',pool:[],include:[]};
 const pool=draft.spots.filter(s=>G.SPOT_GEO[s.id]).map(s=>s.id);
 const ids=Array.isArray(opts.include)?pool.filter(id=>opts.include.includes(id)):pool;
 if(ids.length<2)return {problem:'至少选两处已放进 3D 地图的景点',pool,include:ids};
 if(ids.length>8)return {problem:'一张行程卡最多排 8 处景点',pool,include:ids};
 const east=id=>G.NODES[G.SPOT_GEO[id].node][0],start=ids.includes(opts.start)?opts.start:ids.reduce((a,b)=>east(b)>east(a)?b:a);
 const cache={},get=(a,b)=>cache[a+'>'+b]??=leg(G,a,b);
 let best=null;
 for(const rest of orders(ids.filter(x=>x!==start))){
  const order=[start,...rest],legs=order.slice(1).map((b,i)=>get(order[i],b));
  if(legs.some(l=>!l))continue;
  const minutes=legs.reduce((s,l)=>s+l.minutes,0);
  if(!best||minutes<best.minutes)best={order,legs,minutes};
 }
 if(!best)return {problem:'有景点之间没有连通的路线',pool,include:ids};
 const stay=Math.max(0,Math.min(120,Math.round(Number.isFinite(+opts.stay)?+opts.stay:20)));
 const meters=best.legs.reduce((s,l)=>s+l.meters,0),total=best.minutes+stay*best.order.length;
 const title=String(opts.title||'').trim().slice(0,30)||`${short(draft.title)} · ${CN[best.order.length]||best.order.length}景慢游`;
 return {title,start,order:best.order,legs:best.legs,stay,meters,travelMinutes:best.minutes,totalMinutes:total,pool,include:ids};
}
// The part of a trip result that is adopted into the draft and shown to visitors.
export const tripOf=r=>r&&!r.problem?{title:r.title,order:r.order,legs:r.legs,stay:r.stay,meters:r.meters,travelMinutes:r.travelMinutes,totalMinutes:r.totalMinutes}:null;

// Pre-publish checks. 'block' stops publishing; 'warn' should be looked at; 'info' and 'ok' are for the record.
export function runQA(draft,G){
 const checks=[],push=(level,text,fix={})=>checks.push({level,text,...fix}),geo=runGeo(draft,G);
 if(!G)push('info','这个景区还没有 3D 地图底图，地图校准与行程卡暂不可用');
 for(const p of publishProblems(draft))push('block',p.text,{spotId:p.spotId,tab:p.tab});
 for(const s of draft.spots){
  const nm=short(s.name)||'未命名景点',photos=Object.values(s.photos||{}),g=geo.spots.find(x=>x.id===s.id);
  const noCredit=photos.filter(p=>p.kind==='real'&&!(p.credit?.artist&&p.credit?.license)).length;
  if(noCredit)push('warn',`${nm}：${noCredit} 张实景照片缺少作者或许可信息`,{spotId:s.id,tab:'photos'});
  const uploads=photos.filter(p=>p.kind==='upload').length;
  if(uploads)push('info',`${nm}：${uploads} 张景区上传的图片，发布时需确认使用权`,{spotId:s.id,tab:'photos'});
  const ai=photos.filter(p=>p.kind==='ai-demo'&&p.accepted).length;
  if(ai)push('ok',`${nm}：${ai} 张 AI 补图已审核，游客端会标注 AI`);
  if(!g.matched){if(G)push('warn',`${nm}：不在 3D 地图的底图里，3D 地图上不会出现`,{helper:'geo'});}
  else if(g.has3D&&!Number.isFinite(s.heading))push(Number.isFinite(g.heading)?'info':'warn',Number.isFinite(g.heading)?`${nm}：3D 场景朝向沿用初始估计 ${g.heading}°，建议到 3D 里核对`:`${nm}：3D 场景没有朝向，路标方向会不准`,{helper:'geo'});
  if(!s.narration?.text)push('info',`${nm}：还没有讲解稿`,{helper:'script'});
  else{
   if(s.narration.basis!==scriptBasis(s,g))push('warn',`${nm}：讲解资料或周边景点有变化，讲解稿需要重新生成`,{helper:'script'});
   for(const t of untraced(s.narration.text,s,g).slice(0,3))push('warn',`${nm}：讲解稿里「${t.length>26?t.slice(0,26)+'…':t}」在资料中找不到，请核实`,{helper:'script'});
  }
 }
 if(draft.trip){
  const ids=new Set(draft.spots.map(s=>s.id));
  if(draft.trip.order.some(id=>!ids.has(id)))push('warn','行程卡里有已移除的景点，请重新生成',{helper:'trip'});
 }else if(G)push('info','还没有行程卡',{helper:'trip'});
 if(!checks.some(c=>c.level==='block'||c.level==='warn'))push('ok','没有需要处理的问题');
 const count=level=>checks.filter(c=>c.level===level).length;
 return {checks,block:count('block'),warn:count('warn')};
}
// Fingerprint of the draft parts a helper reads, so the studio can tell when a result is out of date.
export function helperInput(draft,id){
 const spots=draft.spots.map(s=>({id:s.id,name:s.name,guide:s.guide,description:s.description,notice:s.notice,world:Boolean(worldAsset(s))}));
 return hash(JSON.stringify(id==='qa'?draft:id==='trip'?{title:draft.title,ids:spots.map(s=>s.id)}:spots));
}
