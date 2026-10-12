import {PLACES,PILOT_ID,GUIDE_SEED,realPhoto,completionPhoto} from './scenic-places.js';
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
const PILOT_ASSET = Object.freeze({worldId:'55dcc5ef-342c-4548-b937-6ffe6fb330ed',referenceUrl:'/assets/real/huagang.jpg'});
export function newSpot(id, x=.5, y=.5) {
  return {id,name:'新的景点',description:'',guide:'',notice:'',x,y,photos:{},revision:0,confirmedRevision:null,world:null};
}
export function createScenicState() {
  const spots=PLACES.map(p=>({...newSpot(p.id,p.x,p.y),...p,photos:{front:realPhoto(p.id,p.photoName)}}));
  spots[0].world={kind:'pilot',label:'御碑亭实拍试点',revision:0};
  spots[0].pilotAsset=copy(PILOT_ASSET);
  const draft={title:'西湖 · 六处风景',map:{url:'/assets/scenic/garden-map.png',name:'西湖灵感游览图 · AI 插画',custom:false},spots};
  const published=copy(draft);
  for(const {id,name} of ANGLES.filter(a=>a.id!=='front'))published.spots[0].photos[id]={...completionPhoto(id,name),accepted:true};
  return {schema:7,draft,published,publishedAt:null,publishNumber:1};
}
export function upgradeScenicState(state){
  if(state.schema===7)return state;
  upgradeToSix(state);
  // Schema 7 adds guide material; built-in spots get the seed text, nothing is overwritten.
  for(const key of ['draft','published'])for(const s of state[key].spots){if(typeof s.guide!=='string')s.guide=GUIDE_SEED[s.id]||'';if(typeof s.notice!=='string')s.notice='';}
  state.schema=7;return state;
}
function upgradeToSix(state){
  if(state.schema===6)return state;
  const seed=createScenicState();
  // The existing real asset is bound to its source photo, independently of mock jobs.
  const bindPilot=()=>{
    for(const key of ['draft','published']){
      const s=state[key].spots.find(s=>s.id===PILOT_ID);
      if(s&&canCompleteDemo(s))s.pilotAsset=copy(PILOT_ASSET);
    }
    state.schema=6;return state;
  };
  if(state.schema===5)return bindPilot();
  if(state.schema===3||state.schema===4){
    for(const key of ['draft','published']){
      const s=state[key].spots.find(s=>s.id===PILOT_ID);
      if(s&&s.revision===0&&canCompleteDemo(s))s.world=copy(seed[key].spots[0].world);
    }
    for(const s of state.draft.spots){
      if(s.confirmedRevision!==null&&pendingAngles(s).length)touchSpot(s);
    }
    // Only extend the built-in visitor sample; keep user-published snapshots intact.
    if(!state.publishedAt){
      const s=state.published.spots.find(s=>s.id===PILOT_ID);
      if(s&&canCompleteDemo(s))for(const id of ['back','top'])if(!s.photos[id])s.photos[id]=copy(seed.published.spots[0].photos[id]);
    }
    return bindPilot();
  }
  // Keep earlier work accessible as a backup, and never overwrite uploaded material or custom pins.
  const ids=new Set(['pavilion','willow','bridge','lotus','corridor','landing']);
  const untouched=project=>!project.map.custom&&project.spots.every(s=>ids.has(s.id)&&!Object.values(s.photos).some(p=>p.kind==='upload'));
  if(untouched(state.draft)&&untouched(state.published)){
    seed.previousDemo=copy(state);return seed;
  }
  return bindPilot();
}
export function canCompleteDemo(spot){return spot.id===PILOT_ID&&spot.photos.front?.url==='/assets/real/huagang.jpg';}
export function touchSpot(spot) {
  spot.revision++; spot.confirmedRevision=null; spot.world=null;
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
  if(!canCompleteDemo(spot))throw Error('本版仅提供花港观鱼原始实拍的补全样例；其他景点请上传实拍视角');
  const missing=pendingAngles(spot);
  if(!missing.length)throw Error('全部视角均已准备好');
  for(const {id} of missing)spot.photos[id]=completionPhoto(id,ANGLES.find(a=>a.id===id).name);
  touchSpot(spot); return spot;
}
export function confirmProblem(spot) {
  if(!spot.name.trim())return '请填写景点名称';
  if(pendingAngles(spot).length)return '请补齐正面、两侧、背面、俯视和近景，再进行确认';
  if(Object.values(spot.photos).some(p=>p.kind==='ai-demo'&&!p.accepted))return '请逐张查看并接受 AI 补全图片';
  return '';
}
export function confirmSpot(spot) {
  const problem=confirmProblem(spot);if(problem)throw Error(problem);
  spot.confirmedRevision=spot.revision;return spot;
}
export function createDemoWorld(spot, expectedRevision) {
  if(spot.revision!==expectedRevision||spot.confirmedRevision!==spot.revision)throw Error('素材已变化，请重新审核确认');
  spot.world={kind:'demo',label:'世界模型流程样例',revision:spot.revision};return spot;
}
export function publishScenic(state) {
  const {draft}=state,problem=publishProblems(draft)[0];
  if(problem)throw Error(problem.text);
  state.published=copy(draft);state.publishNumber++;state.publishedAt=new Date().toISOString();return state;
}
export function visitorExperience(spot) {
  // Supplemental photo review and mocked jobs do not replace this pre-generated asset.
  // Replacing or removing the actual input photo must sever its visitor association.
  return spot.id===PILOT_ID&&spot.pilotAsset?.worldId===PILOT_ASSET.worldId&&
    spot.pilotAsset.referenceUrl===PILOT_ASSET.referenceUrl&&
    spot.photos.front?.kind==='real'&&spot.photos.front.url===PILOT_ASSET.referenceUrl?'world':'gallery';
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
    if(s.world&&s.world.revision!==s.revision)out.push({text:name+'：3D 结果对应的素材已过期',spotId:s.id,tab:'world'});
  }
  return out;
}
export function draftChanges(state){
  const {draft:d,published:p}=state,out=[],before=new Map(p.spots.map(s=>[s.id,s]));
  if(d.title!==p.title)out.push('景区名称改为「'+d.title+'」');
  if(JSON.stringify(d.map)!==JSON.stringify(p.map))out.push('更换了景区地图');
  for(const s of d.spots){const o=before.get(s.id);if(!o)out.push('新增景点：'+s.name);else if(JSON.stringify(o)!==JSON.stringify(s))out.push(s.name+'：内容有修改');before.delete(s.id);}
  for(const s of before.values())out.push('移除景点：'+s.name);
  return out;
}

// Image references shared by draft and published; the bytes live in the photo store, not in state.
export const REF='idb:';
export const photoRefs=state=>['draft','published'].flatMap(k=>state[k]?[state[k].map,...state[k].spots.flatMap(s=>Object.values(s.photos||{}))]:[]).filter(Boolean);
export const refsIn=state=>new Set(photoRefs(state).map(p=>p.url).filter(u=>u?.startsWith(REF)).map(u=>u.slice(REF.length)));
