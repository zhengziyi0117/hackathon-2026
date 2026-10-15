// Map edit operations: the only way the map agent (and later the studio editor) changes a map package.
// A batch is atomic: every op must apply and the whole package must pass checkMapPackage, or nothing changes.
// Geography facts (water, causeways, terrain, architecture) are not editable here on purpose.
import {checkMapPackage} from './packages.js';
import {MODEL_IDS} from './contract.js';

const ID=/^[a-z][a-z0-9-]*$/,SEASONS=['spring','summer','dusk','autumn','winter'],LABEL_KINDS=['dike','hill','isle','lake','city'];
const isXY=v=>Array.isArray(v)&&v.length===2&&v.every(Number.isFinite);
const round=v=>Math.round(v*1000)/1000;
const xy=v=>v.map(round);
export const OP_TYPES=['add_landmark','update_landmark','remove_landmark','add_label','remove_label','add_node','move_node','remove_node','connect','disconnect','set_spot'];

function applyOne(pkg,op,spotIds,changes){
 const g=pkg.geography,l=pkg.layout,nodes=g.network.nodes,edges=g.network.edges;
 const need=(ok,msg)=>{if(!ok)throw Error(msg);};
 const landmark=id=>{const m=l.landmarks.find(x=>x.id===id);need(m,'没有这个模型实例 '+id);return m;};
 const edgeIndex=(a,b)=>edges.findIndex(e=>(e.a===a&&e.b===b)||(e.a===b&&e.b===a));
 switch(op?.op){
  case 'add_landmark':{
   need(ID.test(op.id||''),'id 需为小写字母开头的 a-z0-9-');need(!l.landmarks.some(x=>x.id===op.id),'模型实例已存在 '+op.id);
   need(MODEL_IDS.includes(op.model),'不支持的模型 '+op.model);need(isXY(op.at),'at 需为 [x,z]');
   const m={id:op.id,model:op.model,at:xy(op.at),rotation:Number.isFinite(op.rotation)?op.rotation:0,scale:Number.isFinite(op.scale)?op.scale:1,lift:Number.isFinite(op.lift)?op.lift:0,spotId:op.spotId??null,parameters:op.parameters&&typeof op.parameters==='object'?{...op.parameters}:{}};
   l.landmarks.push(m);changes.push({kind:'landmark',action:'add',id:m.id,at:m.at});return;}
  case 'update_landmark':{
   const m=landmark(op.id),from=[...m.at];
   if(op.at!==undefined){need(isXY(op.at),'at 需为 [x,z]');m.at=xy(op.at);}
   for(const k of ['rotation','scale','lift'])if(op[k]!==undefined){need(Number.isFinite(op[k]),k+' 需为数字');m[k]=op[k];}
   if(op.model!==undefined){need(MODEL_IDS.includes(op.model),'不支持的模型 '+op.model);m.model=op.model;}
   if(op.parameters!==undefined){need(op.parameters&&typeof op.parameters==='object','parameters 需为对象');m.parameters={...op.parameters};}
   if(op.spotId!==undefined)m.spotId=op.spotId;
   changes.push({kind:'landmark',action:'update',id:m.id,at:m.at,from});return;}
  case 'remove_landmark':{
   const m=landmark(op.id);l.landmarks.splice(l.landmarks.indexOf(m),1);changes.push({kind:'landmark',action:'remove',id:m.id,at:m.at});return;}
  case 'add_label':{
   need(typeof op.text==='string'&&op.text.trim(),'text 不能为空');need(isXY(op.at),'at 需为 [x,z]');need(LABEL_KINDS.includes(op.kind),'kind 需为 '+LABEL_KINDS.join('/'));
   l.labels.push({text:op.text.trim().slice(0,20),at:xy(op.at),kind:op.kind,lift:Number.isFinite(op.lift)?op.lift:.35});changes.push({kind:'label',action:'add',text:op.text,at:xy(op.at)});return;}
  case 'remove_label':{
   const i=l.labels.findIndex(x=>x.text===op.text);need(i>=0,'没有这个地名 '+op.text);changes.push({kind:'label',action:'remove',text:op.text,at:l.labels[i].at});l.labels.splice(i,1);return;}
  case 'add_node':{
   need(/^[A-Za-z][\w-]*$/.test(op.id||''),'节点 id 格式不正确');need(!nodes[op.id],'节点已存在 '+op.id);need(isXY(op.at),'at 需为 [x,z]');
   nodes[op.id]=xy(op.at);changes.push({kind:'node',action:'add',id:op.id,at:nodes[op.id]});return;}
  case 'move_node':{
   need(nodes[op.id],'没有这个节点 '+op.id);need(isXY(op.at),'at 需为 [x,z]');const from=nodes[op.id];nodes[op.id]=xy(op.at);changes.push({kind:'node',action:'update',id:op.id,at:nodes[op.id],from});return;}
  case 'remove_node':{
   need(nodes[op.id],'没有这个节点 '+op.id);need(!edges.some(e=>e.a===op.id||e.b===op.id),'先断开连到 '+op.id+' 的路段');
   need(!Object.values(g.spots).some(s=>s.node===op.id)&&pkg.interaction.startNode!==op.id,op.id+' 是景点停靠点或起点，不能删除');
   changes.push({kind:'node',action:'remove',id:op.id,at:nodes[op.id]});delete nodes[op.id];return;}
  case 'connect':{
   need(nodes[op.a]&&nodes[op.b],'路段两端必须是已有节点');need(edgeIndex(op.a,op.b)<0,'路段已存在 '+op.a+'-'+op.b);need(['walk','boat'].includes(op.mode||'walk'),'mode 需为 walk/boat');
   edges.push({a:op.a,b:op.b,mode:op.mode||'walk'});changes.push({kind:'edge',action:'add',a:op.a,b:op.b,mode:op.mode||'walk',points:[nodes[op.a],nodes[op.b]]});return;}
  case 'disconnect':{
   const i=edgeIndex(op.a,op.b);need(i>=0,'没有这条路段 '+op.a+'-'+op.b);edges.splice(i,1);changes.push({kind:'edge',action:'remove',a:op.a,b:op.b,points:[nodes[op.a],nodes[op.b]]});return;}
  case 'set_spot':{
   need(spotIds?spotIds.includes(op.id):Boolean(g.spots[op.id]),'景区里没有这个景点 '+op.id+'（景点要先在内容里创建）');
   const s=g.spots[op.id]||{},created=!g.spots[op.id];
   if(op.node!==undefined)s.node=op.node;if(op.label!==undefined){need(isXY(op.label),'label 需为 [x,z]');s.label=xy(op.label);}
   if(op.scene!==undefined)s.scene=String(op.scene).slice(0,40);if(op.season!==undefined){need(SEASONS.includes(op.season),'season 需为 '+SEASONS.join('/'));s.season=op.season;}
   if(op.heading!==undefined)s.heading=op.heading;
   need(s.node&&s.label&&s.scene&&s.season,'新景点需要 node、label、scene、season');
   g.spots[op.id]=s;changes.push({kind:'spot',action:created?'add':'update',id:op.id,at:s.label});return;}
  default:throw Error('未知操作 '+op?.op+'，可用：'+OP_TYPES.join(', '));
 }
}

// Returns {pkg, changes} on success, or {errors} with nothing applied. spotIds: content spot ids allowed in geography.spots.
export function applyOps(pkg,ops,spotIds){
 if(!Array.isArray(ops)||!ops.length)return {errors:['ops 需为非空数组']};
 if(ops.length>40)return {errors:['一批最多 40 个操作']};
 const next=structuredClone(pkg),changes=[],errors=[];
 ops.forEach((op,i)=>{try{applyOne(next,op,spotIds,changes);}catch(err){errors.push(`#${i} ${op?.op||'?'}: ${err.message}`);}});
 if(errors.length)return {errors};
 const invalid=checkMapPackage(next,spotIds);
 return invalid.length?{errors:invalid.slice(0,12)}:{pkg:next,changes};
}

// Compact views for the agent: the full package is too large to send each turn.
const near=(at,c,r)=>!c||Math.hypot(at[0]-c[0],at[1]-c[1])<=r;
export function describeMap(pkg,{section='overview',center,radius=6}={}){
 const g=pkg.geography,l=pkg.layout,c=isXY(center)?center:null;
 if(section==='landmarks')return l.landmarks.filter(m=>near(m.at,c,radius)).map(m=>({id:m.id,model:m.model,at:m.at,rotation:+m.rotation.toFixed(2),scale:m.scale,spotId:m.spotId,...(m.entityId?{entityId:m.entityId}:{}),...(Object.keys(m.parameters).length?{parameters:m.parameters}:{})}));
 if(section==='network')return {nodes:Object.entries(g.network.nodes).filter(([,at])=>near(at,c,radius)).map(([id,at])=>({id,at})),edges:g.network.edges.filter(e=>!c||near(g.network.nodes[e.a],c,radius)||near(g.network.nodes[e.b],c,radius))};
 if(section==='spots')return g.spots;
 if(section==='labels')return l.labels;
 if(section==='places')return g.places;
 const count=l.landmarks.reduce((o,m)=>(o[m.model]=(o[m.model]||0)+1,o),{});
 return {id:pkg.manifest.id,name:pkg.manifest.name,schemaVersion:pkg.manifest.schemaVersion,frame:{unitMeters:g.frame.unitMeters,bounds:g.frame.bounds,axes:'x 向东，z 向南'},
  places:g.places,spots:Object.fromEntries(Object.entries(g.spots).map(([id,s])=>[id,{node:s.node,label:s.label,scene:s.scene}])),
  landmarks:{total:l.landmarks.length,byModel:count},network:{nodes:Object.keys(g.network.nodes).length,edges:g.network.edges.length},labels:l.labels.map(x=>x.text),
  architecture:g.architecture?{entities:g.architecture.entities.length,walkBounds:g.architecture.walkBounds}:null,startNode:pkg.interaction.startNode,models:MODEL_IDS};
}
