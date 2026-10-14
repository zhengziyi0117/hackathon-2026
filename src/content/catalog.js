import settings from '../../scenics/catalog.json' with {type:'json'};
import {packages} from './generated-catalog.js';
export {settings};
export const scenicPackages=packages;
export const scenicPackage=id=>packages.find(p=>p.manifest.id===id);
export const defaultPackage=scenicPackage(settings.defaultScenic);
export const defaultScenicId=settings.defaultScenic;
const clone=value=>structuredClone(value);
export const assetById=(owner,id)=>owner.assets.assets.find(a=>a.id===id);
export function photoFromAsset(owner,id,accepted=true){
 const a=assetById(owner,id);
 if(!a?.photo)throw Error('Unknown photo asset: '+id);
 return {url:a.url,...clone(a.photo),accepted};
}
export function createBuiltinScenic(id=defaultScenicId){
 const pkg=scenicPackage(id);if(!pkg)throw Error('Unknown scenic: '+id);
 const {manifest:m}=pkg;
 const spots=pkg.spots.map(owner=>{
  const {photos,publishedPhotos,sample,...content}=clone(owner.content);
  return {...content,photos:Object.fromEntries(Object.entries(photos).map(([angle,asset])=>[angle,photoFromAsset(owner,asset)])),revision:0,confirmedRevision:null,world:sample?clone(sample.initialWorld):null,...(sample?{pilotAsset:clone(sample.binding)}:{})};
 });
 const {package:mapPackage,asset,...mapInfo}=m.map;
 const draft={title:m.title,intro:m.intro,map:{url:assetById(pkg,asset).url,...mapInfo},spots},published=clone(draft);
 for(const owner of pkg.spots){const spot=published.spots.find(s=>s.id===owner.content.id);for(const [angle,id] of Object.entries(owner.content.publishedPhotos||{}))spot.photos[angle]=photoFromAsset(owner,id);}
 return {schema:7,id:m.id,draft,published,publishedAt:null,publishNumber:1};
}
export const builtinScenics=()=>packages.map(p=>createBuiltinScenic(p.manifest.id));
export const seededScenicIds=()=>packages.filter(p=>p.manifest.seedOnUpgrade).map(p=>p.manifest.id);
export function ensureBuiltinScenics(ws){
 const applied=new Set(ws.seededScenics||[]);
 for(const id of seededScenicIds())if(!applied.has(id)){if(!ws.scenics.some(s=>s.id===id))ws.scenics.push(createBuiltinScenic(id));applied.add(id);}
 ws.seededScenics=[...applied];return ws;
}
// Reference identity is part of the recipe: sharing a spot ID never attaches an unrelated model.
export function sampleOwner(spot){
 if(!spot)return null;
 for(const pkg of packages)for(const owner of pkg.spots){
  const c=owner.content,r=c.sample?.reference;
  if(r&&spot.id===c.id&&spot.photos?.[r.angle]?.kind===r.kind&&spot.photos[r.angle].url===assetById(owner,r.asset).url)return owner;
 }
 return null;
}
export function boundSample(spot){
 const owner=sampleOwner(spot),binding=owner?.content.sample.binding;
 return binding&&spot.pilotAsset?.worldId===binding.worldId&&spot.pilotAsset.referenceUrl===binding.referenceUrl?owner:null;
}
export const samplePhoto=(spot,angle)=>{const owner=sampleOwner(spot);return photoFromAsset(owner,owner.content.sample.completion[angle],false);};
export const sampleWorlds=owner=>owner.content.sample.worlds.map(({asset,receipt,...info})=>({...info,spz:assetById(owner,asset).url,receipt:assetById(owner,receipt).url,generated:false}));

// Files belong to one package; their public URL is stable across repository reorganizations.
export const assetRecords=packages.flatMap(pkg=>[
 ...pkg.assets.assets.map(a=>({...a,base:`scenics/${pkg.manifest.id}`})),
 ...pkg.spots.flatMap(o=>o.assets.assets.map(a=>({...a,base:`scenics/${pkg.manifest.id}/spots/${o.content.id}`})))
]);
export const assetFiles=new Map(assetRecords.flatMap(a=>[[a.url,a.base+'/'+a.file],...(a.delivery?[[a.delivery.url,a.base+'/'+a.delivery.file]]:[])]));
export const deliveryCopies=new Map(assetRecords.filter(a=>a.delivery).map(a=>[a.url,a.delivery.url]));
