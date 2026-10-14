import {createBuiltinScenic,builtinScenics,seededScenicIds,ensureBuiltinScenics,sampleOwner,boundSample,samplePhoto,sampleWorlds} from './content/catalog.js';
import {upgradeBuiltinMap,upgradeLegacyScenic,legacyDefaultIntro,legacyScenicId} from './content/legacy-migrations.js';
// The creator's draft and the visitor's published snapshot are deliberately separate.
export const ANGLES = [
  {id:'front', name:'正面全景', hint:'能看清主体与周边环境'},
  {id:'left', name:'左侧视角', hint:'向侧面走动，保留重叠区域'},
  {id:'rear', name:'右侧视角', hint:'从另一侧观察主体'},
  {id:'back', name:'背面视角', hint:'绕到主体背后，检查遮挡部分'},
  {id:'top', name:'俯视全景', hint:'从上方检查屋顶、占地与周边关系'},
  {id:'inside', name:'内部 / 近景', hint:'入口、内部或关键细节'},
];
export const copy = value => structuredClone(value);
export function newSpot(id, x=.5, y=.5) {
  return {id,name:'新的景点',description:'',guide:'',notice:'',x,y,photos:{},revision:0,confirmedRevision:null,world:null};
}
// Compatibility export for callers that create the default built-in scenic.
export const createScenicState=()=>createBuiltinScenic();
export const createWorkspace=()=>({schema:8,seededScenics:seededScenicIds(),scenics:builtinScenics()});
export function newScenic(title,map){return {schema:7,id:crypto.randomUUID().slice(0,8),draft:{title,intro:'',map,spots:[]},published:null,publishedAt:null,publishNumber:0};}
export function upgradeWorkspace(value){
  if(value?.schema===8&&Array.isArray(value.scenics)){value.scenics=value.scenics.map(upgradeScenicState).map(upgradeBuiltinMap);return ensureBuiltinScenics(value);}
  if(![1,2,3,4,5,6,7].includes(value?.schema)||!value.draft?.spots||!value.published?.spots)return createWorkspace();
  // A single-scenic state from before schema 8 becomes the West Lake entry, untouched otherwise.
  const sc=upgradeScenicState(value);sc.id||=legacyScenicId;
  for(const k of ['draft','published'])if(typeof sc[k].intro!=='string')sc[k].intro=sc.id===legacyScenicId?legacyDefaultIntro:'';
  return ensureBuiltinScenics({schema:8,scenics:[upgradeBuiltinMap(sc)]});
}
export const upgradeScenicState=state=>upgradeLegacyScenic(state,{pendingAngles,touchSpot});
export const canCompleteDemo=spot=>Boolean(sampleOwner(spot)?.content.sample.completion);
export function touchSpot(spot) {
  // A paid, generated world survives photo edits; worldStale() tells the studio its inputs changed.
  spot.revision++; spot.confirmedRevision=null; if(spot.world?.kind!=='generated')spot.world=null;
  return spot;
}
// Beyond the six review angles a spot can hold any number of extra photos, keyed 'more-…'.
export const isExtra=key=>/^more-[a-z0-9-]{4,40}$/.test(key);
export const extraId=()=>'more-'+crypto.randomUUID().slice(0,8);
export const photoName=key=>isExtra(key)?'补充照片':ANGLES.find(a=>a.id===key)?.name||key;
export const orderedPhotos=spot=>[...ANGLES.map(a=>a.id).filter(k=>spot.photos[k]),...Object.keys(spot.photos).filter(isExtra)].map(k=>[k,spot.photos[k]]);
export function putPhoto(spot, angle, photo) {
  if(!ANGLES.some(a=>a.id===angle)&&!isExtra(angle))throw Error('未知视角');
  spot.photos[angle]=photo; return touchSpot(spot);
}
export function removePhoto(spot, angle) {delete spot.photos[angle];return touchSpot(spot);}
export function pendingAngles(spot) {return ANGLES.filter(a=>!spot.photos[a.id]);}
export function completeDemo(spot) {
  if(!Object.values(spot.photos).some(p=>p.kind!=='ai-demo'))throw Error('请先上传至少一张参考图片');
  if(!canCompleteDemo(spot))throw Error('本版仅提供已配置原始实拍的补全样例；其他景点请上传实拍视角');
  const missing=pendingAngles(spot);
  if(!missing.length)throw Error('全部视角均已准备好');
  for(const {id} of missing)spot.photos[id]=samplePhoto(spot,id);
  touchSpot(spot); return spot;
}
// Real world generation (World Labs Marble). Only compass directions can be placed by azimuth; top and close-up stay photo-only.
export const WORLD_ANGLES=['front','rear','back','left'];
export const WORLD_MODELS=[
  {id:'marble-1.0-draft',name:'快速草稿',label:'Marble 1.0 Draft',credits:n=>n>1?250:230,hint:'几分钟出结果，适合先看效果'},
  {id:'marble-1.1',name:'精细版',label:'Marble 1.1',credits:n=>n>1?1600:1580,hint:'约 5 分钟，细节和范围更好'},
];
export const modelOf=id=>WORLD_MODELS.find(m=>m.id===id);
// Photos sent to generation: real or uploaded, plus AI completions only after staff accepted them.
export function worldInputs(spot){
  return WORLD_ANGLES.map(angle=>[angle,spot.photos[angle]]).filter(([,p])=>p&&(p.kind!=='ai-demo'||p.accepted)).map(([angle,p])=>({angle,url:p.url,kind:p.kind}));
}
export function worldProblem(spot){
  if(!spot.name.trim())return '请先填写景点名称';
  if(!worldInputs(spot).length)return '至少需要一张正面、侧面或背面照片';
  return '';
}
const inputKey=inputs=>inputs.map(i=>i.angle+'='+i.url).join('|');
// The generated world no longer matches the photos it was made from.
export const worldStale=spot=>spot.world?.kind==='generated'&&inputKey(spot.world.inputs||[])!==inputKey(worldInputs(spot));
export function applyGeneratedWorld(spot,job,result){
  spot.world={kind:'generated',model:job.model,worldId:result.worldId,spz:result.spz,receipt:result.receipt,credits:result.credits??null,inputs:job.inputs,createdAt:new Date().toISOString()};
  return spot;
}
export function publishScenic(state) {
  const {draft}=state,problem=publishProblems(draft)[0];
  if(problem)throw Error(problem.text);
  state.published=copy(draft);state.publishNumber++;state.publishedAt=new Date().toISOString();return state;
}
// The 3D scene a spot shows: its own generated world first, else the bundled single-photo pilot.
// Replacing or removing the pilot's input photo severs that association.
export function worldAsset(spot){
  const w=spot?.world;
  if(w?.kind==='generated'&&/^\/generated\/[a-zA-Z0-9-]{8,64}\/world\.spz$/.test(w.spz))
    return {spz:w.spz,receipt:w.receipt,model:w.model,generated:true,
      note:`由 ${modelOf(w.model)?.label||w.model} 以 ${w.inputs.length} 张照片生成${w.inputs.some(i=>i.kind==='ai-demo')?'（含经审核的 AI 补图）':''}，未拍到的区域由模型推测。`};
  const sample=boundSample(spot);
  if(sample){const {id,label,short,...asset}=sampleWorlds(sample)[0];return asset;}
  return null;
}
export const visitorExperience=spot=>worldAsset(spot)?'world':'gallery';
// The bundled pilot also ships a second generation from six inputs (one real photo, five reviewed AI views).
// It is an exploratory trial with a different prompt and inputs, not a controlled comparison.
export function worldVariants(spot){
  const base=worldAsset(spot);if(!base)return [];
  const single={...base,id:'single',label:'单张实拍',short:'单图'};
  const sample=boundSample(spot);
  return base.generated||!sample?[single]:sampleWorlds(sample);
}

// Retrieval-only guide: every answer is a sentence the scenic staff wrote, or an honest "not in the material".
const SERVICE=/开放|几点|营业|门票|票价|价格|多少钱|轮椅|无障碍|天气|排队|人多|拥挤|今天|明天|闭园|停车|交通|怎么去/;
const NOTICE=/提示|通知|公告|注意/;
const GENERAL=/讲讲|介绍|说说|聊聊|一下|这里|这个|眼前|是什么|什么地方|有什么|哪里|故事|为什么|值得|看点/g;
export function answerSpot(spot,question){
  const q=String(question||'').trim().slice(0,200),guide=(spot.guide||spot.description||'').trim(),notice=(spot.notice||'').trim();
  const known=text=>({text,known:true}),unknown=text=>({text,known:false});
  if(NOTICE.test(q)||SERVICE.test(q)){
    if(notice)return known(notice);
    return unknown(SERVICE.test(q)?'景区资料里没有这项信息。开放时间、票价、天气、交通或无障碍条件，请以景区官方渠道为准。':'这个景点暂时没有发布运营提示；这不代表现场没有限制。');
  }
  if(!guide)return unknown('这个景点还没有讲解资料。');
  // Score sentences by two-character overlap, ignoring the spot's own name and generic filler words.
  const core=q.replace(GENERAL,'').replace(new RegExp('['+spot.name.replace(/[\s·\]\\^-]/g,'')+']','g'),'').replace(/[\s，。？！?!,.、]/g,'');
  const grams=new Set();for(let i=0;i<core.length-1;i++)grams.add(core.slice(i,i+2));
  if(!grams.size)return known(guide);
  // Questions about a name's origin rarely share characters with the answer sentence.
  if(/名字|得名|由来|来历|为什么叫|怎么来/.test(q)){const origin=guide.split(/(?<=[。！？])/).filter(x=>/得名|源于|由此|因而/.test(x));if(origin.length)return known(origin.join('').trim());}
  const sentences=guide.split(/(?<=[。！？])/).map(x=>x.trim()).filter(Boolean);
  const hits=sentences.filter(x=>[...grams].some(g=>x.includes(g)));
  return hits.length?known(hits.join('')):unknown('景区资料里没有找到这个问题的答案。可以问问这里的来历、看点或传说。');
}

// Roaming box per 3D spot, in metres from the photo's camera; beyond it a single-photo splat is mostly guesswork.
export const DEFAULT_ROAM=Object.freeze({front:2.5,back:.6,left:1.2,right:1.2,up:.4,down:.5});
export function roamOf(spot){
  const r=spot?.roam||{};
  return Object.fromEntries(Object.entries(DEFAULT_ROAM).map(([k,v])=>[k,Number.isFinite(r[k])?Math.min(5,Math.max(0,r[k])):v]));
}
export function roamBounds(roam){const r=roamOf({roam});return {min:[-r.left,-r.down,-r.front],max:[r.right,r.up,r.back]};}
// Everything that blocks publishing, each tied to the spot/tab where it can be fixed.
export function publishProblems(draft){
  const out=[];
  if(!draft.title.trim()||!draft.spots.length)out.push({text:'请填写景区名称并添加至少一个景点'});
  for(const s of draft.spots){
    const name=s.name.trim()||'未命名景点';
    if(!s.name.trim())out.push({text:name+'：请填写名称',spotId:s.id,tab:'info'});
    if(!Object.keys(s.photos).length)out.push({text:name+'：至少需要一张图片',spotId:s.id,tab:'photos'});
    const pending=Object.values(s.photos).filter(p=>p.kind==='ai-demo'&&!p.accepted).length;
    if(pending)out.push({text:name+'：还有 '+pending+' 张 AI 图片未审核',spotId:s.id,tab:'photos'});
  }
  return out;
}
export function draftChanges(state){
  const {draft:d,published:p}=state;if(!p)return ['首次发布「'+d.title+'」'];const out=[],before=new Map(p.spots.map(s=>[s.id,s]));
  if(d.title!==p.title)out.push('景区名称改为「'+d.title+'」');if((d.intro||'')!==(p.intro||''))out.push('更新了景区介绍');
  if(JSON.stringify(d.map)!==JSON.stringify(p.map))out.push('更换了景区地图');
  const ONLY={world:'：3D 场景已更新',narration:'：讲解稿已更新',heading:'：3D 场景朝向已调整'};
  for(const s of d.spots){
    const o=before.get(s.id);before.delete(s.id);
    if(!o){out.push('新增景点：'+s.name);continue;}
    const keys=[...new Set([...Object.keys(o),...Object.keys(s)])].filter(k=>JSON.stringify(o[k])!==JSON.stringify(s[k]));
    if(keys.length)out.push(s.name+(keys.length===1&&ONLY[keys[0]]||'：内容有修改'));
  }
  for(const s of before.values())out.push('移除景点：'+s.name);
  if(JSON.stringify(d.trip||null)!==JSON.stringify(p.trip||null))out.push(d.trip?'更新了行程卡「'+d.trip.title+'」':'移除了行程卡');
  return out;
}

// Image references shared by draft and published; the bytes live in the photo store, not in state.
export const REF='idb:';
const scenicRefs=sc=>['draft','published'].flatMap(k=>sc[k]?[sc[k].map,...sc[k].spots.flatMap(s=>Object.values(s.photos||{}))]:[]);
export const photoRefs=state=>(state.scenics||[state]).flatMap(scenicRefs).filter(Boolean);
export const refsIn=state=>new Set(photoRefs(state).map(p=>p.url).filter(u=>u?.startsWith(REF)).map(u=>u.slice(REF.length)));
