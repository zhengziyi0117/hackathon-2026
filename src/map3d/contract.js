// Map Package v1. The same contract generates the editor JSON Schema and checks builds.
const str={type:'string',minLength:1},num={type:'number'},positive={type:'number',exclusiveMinimum:0},nonnegative={type:'number',minimum:0},color={type:'string',pattern:'^#[0-9a-fA-F]{6}$'},bool={type:'boolean'};
const array=(items,minItems=0)=>({type:'array',items,minItems});
const tuple=(...prefixItems)=>({type:'array',prefixItems,minItems:prefixItems.length,maxItems:prefixItems.length});
const xy=tuple(num,num),xyz=tuple(num,num,num);
const object=(properties,optional=[])=>({type:'object',properties,required:Object.keys(properties).filter(k=>!optional.includes(k)),additionalProperties:false});
const dictionary=s=>({type:'object',additionalProperties:s,minProperties:1});
const oneOf=(...anyOf)=>({anyOf});
const enumeration=(...values)=>({enum:values});
const version={const:1},id={type:'string',pattern:'^[a-z][a-z0-9-]*$'};
const quality=object({terrainSegments:{type:'integer',minimum:64,maximum:512},landTextureResolution:{type:'integer',minimum:64,maximum:1024},shadowMapSize:{enum:[1024,2048,4096]}});
const mood=object({name:str,short:str,sky:tuple(color,color,color),fog:color,sun:object({dir:xyz,color,i:nonnegative}),hemi:tuple(color,color,nonnegative),water:tuple(color,color),grass:color,snow:nonnegative,night:nonnegative,blossom:nonnegative,autumn:nonnegative,lotus:nonnegative,exposure:positive,emissionScale:nonnegative,petals:nonnegative,flakes:nonnegative,stars:nonnegative,moon:nonnegative,cloud:color});
const pose=object({target:xyz,distance:positive,theta:num,phi:positive});
export const MODEL_IDS=['stele-pavilion','lake-terrace','pavilion','three-lanterns','pagoda','slender-pagoda','arch-bridge'];
export const CONTRACTS={
 manifest:object({schemaVersion:version,id,name:str,geography:str,layout:str,interaction:str,styles:array(id,1),defaultStyle:id}),
 geography:object({schemaVersion:version,id,name:str,frame:object({origin:xy,unitMeters:positive,bounds:object({minX:num,maxX:num,minZ:num,maxZ:num}),source:str,axes:object({x:{const:'east'},z:{const:'south'}}),projection:object({lonUnits:positive,latUnits:positive})}),
  provenance:object({attribution:str,url:{type:'string',pattern:'^https://'},fetched:str,notes:array(str,1)}),water:array(array(xy,3),1),places:dictionary(xy),
  causeways:array(object({id,name:str,width:positive,minor:bool,points:array(xy,2),bridges:array(object({name:str,t:{type:'number',minimum:0,maximum:1},big:bool}))},['minor'])),bridge:object({length:positive,height:positive,gap:positive}),
  terrain:object({cell:{type:'number',minimum:.05,maximum:1},hills:array(object({at:xy,radius:positive,height:positive})),westRidge:object({startX:num,width:positive,height:nonnegative,noise:nonnegative}),city:object({eastX:num,eastWidth:positive,northX:num,northWidth:positive,northZ:num,northDepth:positive})}),
  network:object({nodes:dictionary(xy),edges:array(object({a:str,b:str,mode:enumeration('walk','boat')}),1)}),
  spots:dictionary(object({node:str,label:xy,scene:str,heading:{type:'number',minimum:0,exclusiveMaximum:360},season:enumeration('spring','summer','dusk','autumn','winter')},['heading']))}),
 layout:object({schemaVersion:version,id,mapId:id,catalogVersion:version,
  landmarks:array(object({id,model:enumeration(...MODEL_IDS),at:xy,rotation:num,scale:positive,lift:num,spotId:oneOf(id,{type:'null'}),parameters:{type:'object',additionalProperties:positive},absoluteY:num},['absoluteY']),1),
  labels:array(object({text:str,at:xy,kind:enumeration('dike','hill','isle','lake','city'),lift:num})),
  vegetation:object({seed:num,attempts:{type:'integer',minimum:1,maximum:20000},islands:array(tuple(num,num,positive))}),city:object({seed:num}),
  lotus:object({at:xy,seed:num,attempts:{type:'integer',minimum:1,maximum:10000},maxPads:{type:'integer',minimum:1,maximum:2000}}),pond:object({at:xy,radius:positive,koi:{type:'integer',minimum:0,maximum:100}}),boatLoops:array(tuple(xy,positive,positive)),quality}),
 interaction:object({schemaVersion:version,id,mapId:id,startNode:str,defaultMood:enumeration('spring','summer','dusk','autumn','winter'),avatar:object({scale:positive,keyboardSpeed:positive,walkSpeed:positive,boatSpeed:positive,arrivalRadius:positive}),routing:object({boatCostMultiplier:positive,walkMetersPerMinute:positive,boatMetersPerMinute:positive,straightSampleStep:positive}),movement:object({boundsPadding:nonnegative,minLand:nonnegative,maxTerrainHeight:positive}),camera:object({fov:{type:'number',minimum:10,maximum:100},intro:pose,home:pose,minDistance:positive,maxDistance:positive,minPhi:positive,maxPhi:positive})}),
 style:object({schemaVersion:version,id,name:str,description:str,swatches:tuple(color,color,color),geometry:enumeration('classic','folded-paper','voxel','bricks','adventure'),terrain:object(Object.fromEntries(['sand','lawn','meadow','forest','rock','bed','bedDeep','city'].map(k=>[k,color]))),
  treePalette:object(Object.fromEntries(['round','conifer','willow','peach'].map(k=>[k,object({green:array(color,1),autumn:array(color,1),winter:array(color,1),blossom:array(color,1)},k==='peach'?[]:['blossom'])]))),
  strata:array(tuple({type:'number',minimum:0,maximum:1},color),2),base:color,path:color,
  materials:object(Object.fromEntries(['stone','stoneDark','wall','wood','woodDark','roof','roofCity','roofBronze','gold','pagoda','hull','awning','skin','robe','hair','umbrella'].map(k=>[k,color]))),
  landform:object({cell:{type:'number',minimum:.2,maximum:.6},step:{type:'number',minimum:.1,maximum:.4},minHeight:{type:'number',minimum:.35,maximum:1}}),
  surface:object({paperGrain:nonnegative,roughness:oneOf({type:'number',minimum:0,maximum:1},{type:'null'}),flatTerrain:bool,contours:nonnegative}),water:object({waves:nonnegative,specular:nonnegative,grain:nonnegative,pond:color}),post:object({bloomDay:nonnegative,bloomNight:nonnegative,tilt:nonnegative}),moods:object(Object.fromEntries(['spring','summer','dusk','autumn','winter'].map(k=>[k,mood])))},['landform'])
};
// Implements only the schema vocabulary emitted above; no executable code is accepted in map files.
export function schemaErrors(schema,value,path='$'){
 if(schema.anyOf)return schema.anyOf.some(s=>!schemaErrors(s,value,path).length)?[]:[path+': does not match any allowed type'];
 const errors=[],fail=message=>errors.push(path+': '+message),type=schema.type;
 if(schema.const!==undefined&&value!==schema.const)fail('expected '+schema.const);
 if(schema.enum&&!schema.enum.includes(value))fail('unsupported value '+String(value));
 if(type){const ok=type==='array'?Array.isArray(value):type==='null'?value===null:type==='object'?!!value&&typeof value==='object'&&!Array.isArray(value):type==='integer'?Number.isInteger(value):type==='number'?typeof value==='number'&&Number.isFinite(value):typeof value===type;if(!ok){fail('expected '+type);return errors;}}
 if(typeof value==='number'){
  for(const [key,valid] of [['minimum',value>=schema.minimum],['maximum',value<=schema.maximum],['exclusiveMinimum',value>schema.exclusiveMinimum],['exclusiveMaximum',value<schema.exclusiveMaximum]])if(schema[key]!==undefined&&!valid)fail(key+' '+schema[key]);
 }
 if(typeof value==='string'){
  if(schema.minLength&&value.length<schema.minLength)fail('empty string');
  if(schema.pattern&&!new RegExp(schema.pattern).test(value))fail('invalid format');
 }
 if(Array.isArray(value)){
  if(value.length<(schema.minItems||0)||value.length>(schema.maxItems??Infinity))fail('invalid array length');
  value.forEach((v,i)=>{const s=schema.prefixItems?.[i]||schema.items;if(s)errors.push(...schemaErrors(s,v,`${path}[${i}]`));});
 }
 if(type==='object'){
  if(Object.keys(value).length<(schema.minProperties||0))fail('empty object');
  for(const k of schema.required||[])if(!Object.hasOwn(value,k))errors.push(path+'.'+k+': required');
  for(const [k,v] of Object.entries(value)){const s=schema.properties?.[k];if(s)errors.push(...schemaErrors(s,v,path+'.'+k));else if(schema.additionalProperties===false)errors.push(path+'.'+k+': unknown field');else if(typeof schema.additionalProperties==='object')errors.push(...schemaErrors(schema.additionalProperties,v,path+'.'+k));}
 }
 return errors;
}
export function validatePackage(pkg,styles){
 const errors=[];
 for(const key of ['manifest','geography','layout','interaction'])errors.push(...schemaErrors(CONTRACTS[key],pkg[key],key));
 for(const [id,s] of Object.entries(styles))errors.push(...schemaErrors(CONTRACTS.style,s,'styles.'+id));
 if(errors.length)return errors;
 const {manifest:m,geography:g,layout:l,interaction:r}=pkg;
 if(g.id!==m.id||l.mapId!==m.id||r.mapId!==m.id)errors.push('mapId: all layers must reference the manifest map');
 const B=g.frame.bounds;if(B.minX>=B.maxX||B.minZ>=B.maxZ)errors.push('geography.frame.bounds: inverted bounds');
 if((B.maxX-B.minX)*(B.maxZ-B.minZ)/g.terrain.cell**2>2500000)errors.push('geography.terrain: distance grid exceeds 2.5 million cells');
 const inBounds=p=>p[0]>=B.minX&&p[0]<=B.maxX&&p[1]>=B.minZ&&p[1]<=B.maxZ;
 const nodes=g.network.nodes;
 for(const [id,at] of Object.entries(nodes))if(!inBounds(at))errors.push('network.nodes.'+id+': outside bounds');
 if(!nodes[r.startNode])errors.push('interaction.startNode: unknown node');
 const edgeKeys=new Set();for(const e of g.network.edges){
  if(!nodes[e.a]||!nodes[e.b]||e.a===e.b)errors.push('network.edges: unknown or identical endpoints '+e.a+'-'+e.b);
  const key=[e.a,e.b].sort().join('|');if(edgeKeys.has(key))errors.push('network.edges: duplicate '+key);edgeKeys.add(key);
 }
 for(const [id,s] of Object.entries(g.spots)){if(!nodes[s.node])errors.push('spots.'+id+': unknown node');if(!inBounds(s.label))errors.push('spots.'+id+': label outside bounds');}
 const modelIDs=new Set(),bound=new Set();
 const modelParams={pavilion:['size','height','roofH'],pagoda:['tiers','r','body'], 'arch-bridge':['length','height','width','arch']};
 for(const model of l.landmarks){
  if(modelIDs.has(model.id))errors.push('layout.landmarks: duplicate id '+model.id);modelIDs.add(model.id);
  if(!inBounds(model.at))errors.push('layout.landmarks.'+model.id+': outside bounds');
  if(model.spotId){if(!g.spots[model.spotId]||bound.has(model.spotId))errors.push('layout.landmarks.'+model.id+': invalid or duplicate spot binding');bound.add(model.spotId);}
  for(const key of Object.keys(model.parameters))if(!(modelParams[model.model]||[]).includes(key))errors.push('layout.landmarks.'+model.id+'.parameters.'+key+': unknown parameter');
  if(model.model==='pagoda'&&model.parameters.tiers!==undefined&&(!Number.isInteger(model.parameters.tiers)||model.parameters.tiers>7))errors.push('pagoda tiers: must be 1–7');
 }
 for(const id of Object.keys(g.spots))if(!bound.has(id))errors.push('layout.landmarks: missing model for '+id);
 if(r.camera.minDistance>r.camera.maxDistance||r.camera.minPhi>r.camera.maxPhi)errors.push('interaction.camera: inverted limits');
 if(!m.styles.includes(m.defaultStyle))errors.push('manifest.defaultStyle: not in styles');
 for(const id of m.styles){if(!styles[id]||styles[id].id!==id)errors.push('manifest.styles: missing style '+id);}
 for(const [id,s] of Object.entries(styles)){
  if(['voxel','bricks'].includes(s.geometry)&&!s.landform)errors.push('styles.'+id+'.landform: terraced geometry requires a bounded surface profile');
  const bands=s.strata.map(b=>b[0]);if(bands[0]!==0||bands.at(-1)!==1||bands.some((b,i)=>i&&b<=bands[i-1]))errors.push('styles.'+id+'.strata: must ascend from 0 to 1');
 }
 return errors;
}
