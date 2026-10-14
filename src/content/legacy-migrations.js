import {createBuiltinScenic,scenicPackage,sampleOwner} from './catalog.js';
const copy=value=>structuredClone(value);
// Historical identity must not change when the product chooses a different default scenic.
export const legacyScenicId='westlake';

// Historical schema adapters are isolated from current editing and rendering code.
export function upgradeBuiltinMap(sc){
 const pkg=scenicPackage(sc.id||legacyScenicId);if(!pkg?.manifest.legacy)return sc;
 const seed=createBuiltinScenic(pkg.manifest.id);
 for(const key of ['draft','published']){
  const p=sc[key];if(!p||p.map?.custom||!pkg.manifest.legacy.replacedMapUrls.includes(p.map?.url))continue;
  p.map=copy(seed[key].map);
  for(const s of p.spots){const original=seed[key].spots.find(x=>x.id===s.id);if(original){s.x=original.x;s.y=original.y;}}
 }
 return sc;
}
export function upgradeLegacyScenic(state,{pendingAngles,touchSpot}){
 if(state.schema===7)return state;
 const pkg=scenicPackage(state.id||legacyScenicId),seed=pkg?createBuiltinScenic(pkg.manifest.id):null;
 if(state.schema!==6){
  const bind=()=>{for(const key of ['draft','published'])for(const s of state[key]?.spots||[]){const owner=sampleOwner(s);if(owner)s.pilotAsset=copy(owner.content.sample.binding);}state.schema=6;};
  if(state.schema===5)bind();
  else if(state.schema===3||state.schema===4){
   for(const key of ['draft','published'])for(const s of state[key]?.spots||[]){const owner=sampleOwner(s);if(owner&&s.revision===0)s.world=copy(owner.content.sample.initialWorld);}
   for(const s of state.draft.spots)if(s.confirmedRevision!==null&&pendingAngles(s).length)touchSpot(s);
   if(!state.publishedAt)for(const s of state.published.spots)if(sampleOwner(s))for(const angle of ['back','top'])if(!s.photos[angle])s.photos[angle]=copy(seed.published.spots.find(x=>x.id===s.id).photos[angle]);
   bind();
  }else{
   const ids=new Set(pkg?.manifest.legacy?.previousSpotIds||[]);
   const untouched=p=>p&&!p.map.custom&&p.spots.every(s=>ids.has(s.id)&&!Object.values(s.photos).some(p=>p.kind==='upload'));
   if(seed&&ids.size&&untouched(state.draft)&&untouched(state.published)){seed.previousDemo=copy(state);state=seed;}
   else bind();
  }
 }
 for(const key of ['draft','published'])for(const s of state[key]?.spots||[]){if(typeof s.guide!=='string')s.guide=pkg?.spots.find(o=>o.content.id===s.id)?.content.guide||'';if(typeof s.notice!=='string')s.notice='';}
 state.schema=7;return state;
}
export const legacyDefaultIntro=scenicPackage(legacyScenicId).manifest.intro;
