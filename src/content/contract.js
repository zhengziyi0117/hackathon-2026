import {schemaErrors} from '../map3d/contract.js';
const text={type:'string'},str={type:'string',minLength:1},id={type:'string',pattern:'^[a-z][a-z0-9-]*$'},bool={type:'boolean'};
const file={type:'string',pattern:'^[a-zA-Z0-9_./-]+$'},url={type:'string',pattern:'^/assets/[a-zA-Z0-9_./-]+$'},hash={type:'string',pattern:'^[a-f0-9]{64}$'};
const object=(properties,optional=[])=>({type:'object',properties,required:Object.keys(properties).filter(k=>!optional.includes(k)),additionalProperties:false});
const array=(items,minItems=0)=>({type:'array',items,minItems});
const refs={type:'object',additionalProperties:id};
const credit={type:'object',required:['artist','source','license','changes'],properties:{artist:str,source:str,license:str,changes:str},additionalProperties:true};
const photo=object({name:str,kind:{enum:['real','ai-demo']},credit});
export const CONTENT_CONTRACTS={
 catalog:object({schemaVersion:{const:1},scenics:array(id,1),defaultScenic:id,featuredSpot:id,closingSpot:id}),
 manifest:object({schemaVersion:{const:1},id,title:str,intro:text,map:object({package:{const:'map/manifest.json'},asset:id,name:str,custom:{const:false},legend:text},['legend']),spots:array(id,1),seedOnUpgrade:bool,legacy:object({replacedMapUrls:array(url),previousSpotIds:array(id)})},['legacy']),
 assets:object({schemaVersion:{const:1},assets:array(object({id,file,url,sha256:hash,publish:bool,photo,delivery:object({file,url,sha256:hash,maxDimension:{type:'integer',minimum:1},quality:{type:'integer',minimum:1,maximum:100},changes:str})},['photo','delivery']))}),
 spot:object({id,name:str,description:text,guide:text,notice:text,x:{type:'number',minimum:0,maximum:1},y:{type:'number',minimum:0,maximum:1},photos:refs,publishedPhotos:refs,photoName:text,factSource:text,heading:{type:'number',minimum:0,exclusiveMaximum:360},scene:str,narration:object({text}),sample:object({reference:object({angle:{enum:['front','left','rear','back','top','inside']},asset:id,kind:{const:'real'}}),binding:object({worldId:str,referenceUrl:url}),initialWorld:object({kind:{const:'pilot'},label:str,revision:{const:0}}),completion:refs,worlds:array(object({id,asset:id,receipt:id,model:str,label:str,short:str,note:str}),1)})},['publishedPhotos','photoName','factSource','heading','scene','narration','sample'])
};
export function validateScenicPackage(pkg){
 const errors=[...schemaErrors(CONTENT_CONTRACTS.manifest,pkg.manifest,'manifest'),...schemaErrors(CONTENT_CONTRACTS.assets,pkg.assets,'assets')];
 if(errors.length)return errors;
 const m=pkg.manifest,ids=pkg.spots.map(o=>o.content.id);
 if(new Set(m.spots).size!==m.spots.length||JSON.stringify(ids)!==JSON.stringify(m.spots))errors.push('Spot order/IDs must match manifest.spots');
 if(m.id!==pkg.map.manifest.id||JSON.stringify([...m.spots].sort())!==JSON.stringify(Object.keys(pkg.map.geography.spots).sort()))errors.push('Content and map must cover the same scenic and spots');
 const checkAssets=(owner,where)=>{
  errors.push(...schemaErrors(CONTENT_CONTRACTS.assets,owner.assets,where));
  const assets=owner.assets?.assets||[];
  if(new Set(assets.map(a=>a.id)).size!==assets.length)errors.push(where+': duplicate asset ID');
  return new Map(assets.map(a=>[a.id,a]));
 };
 const top=checkAssets(pkg,'assets');
 if(!top.get(m.map.asset)?.publish&&!top.get(m.map.asset)?.delivery)errors.push('Map image must be published');
 for(const owner of pkg.spots){
  const c=owner.content,where='spots/'+c.id,shape=schemaErrors(CONTENT_CONTRACTS.spot,c,where);errors.push(...shape);
  const assets=checkAssets(owner,where+'/assets');if(shape.length)continue;
  const photoRefs={...c.photos,...c.publishedPhotos,...c.sample?.completion};
  for(const [angle,ref] of Object.entries(photoRefs)){
   if(!['front','left','rear','back','top','inside'].includes(angle))errors.push(where+': unknown photo angle '+angle);
   const a=assets.get(ref);if(!a?.photo||(!a.publish&&!a.delivery))errors.push(where+': unavailable photo '+ref);
  }
  if(c.sample){
   const r=c.sample.reference,a=assets.get(r.asset);
   if(c.photos[r.angle]!==r.asset||a?.photo?.kind!==r.kind||a?.url!==c.sample.binding.referenceUrl)errors.push(where+': sample reference must match its exact real photo');
   for(const angle of ['front','left','rear','back','top','inside'].filter(k=>k!==r.angle))if(!c.sample.completion[angle])errors.push(where+': missing completion recipe for '+angle);
   for(const ref of Object.values(c.sample.completion))if(assets.get(ref)?.photo?.kind!=='ai-demo')errors.push(where+': completion must be marked AI');
   if(new Set(c.sample.worlds.map(w=>w.id)).size!==c.sample.worlds.length)errors.push(where+': duplicate world variant');
   for(const w of c.sample.worlds)for(const key of ['asset','receipt']){const a=assets.get(w[key]);if(!a?.publish||!a.file.endsWith(key==='asset'?'.spz':'.json'))errors.push(where+': world/receipt must be published in the expected format: '+w[key]);}
  }
 }
 return errors;
}
