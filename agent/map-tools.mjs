// Pi extension loaded into the map-agent child process (`pi --mode rpc -e agent/map-tools.mjs`).
// The map package lives in JINGJIAN_MAP_STATE (JSON: {pkg, spotIds, version}); the server may rewrite it (revert, manual edit).
// Every write goes through applyOps, so the agent can only produce packages that pass the map contract.
import {readFile,writeFile,rename} from 'node:fs/promises';

const ROOT=new URL('../src/map3d/',import.meta.url).href;
const statePath=process.env.JINGJIAN_MAP_STATE;
const text=t=>({content:[{type:'text',text:typeof t==='string'?t:JSON.stringify(t)}]});
let queue=Promise.resolve(),geoCache={key:null,geo:null};
const load=async()=>JSON.parse(await readFile(statePath,'utf8'));
async function save(state){await writeFile(statePath+'.tmp',JSON.stringify(state));await rename(statePath+'.tmp',statePath);}

export default async function(pi){
 const [{applyOps,describeMap,OP_TYPES},{createGeography}]=await Promise.all([import(ROOT+'ops.js'),import(ROOT+'geography.js')]);
 const geoOf=state=>{if(geoCache.key!==state.version){geoCache={key:state.version,geo:createGeography(state.pkg.geography,state.pkg.interaction)};}return geoCache.geo;};
 pi.registerTool({name:'inspect_map',label:'查看地图',description:'查看当前地图包。section: overview（默认）| landmarks | network | spots | labels | places；landmarks/network 可用 center:[x,z] 与 radius 只看局部。',
  parameters:{type:'object',properties:{section:{type:'string',enum:['overview','landmarks','network','spots','labels','places']},center:{type:'array',items:{type:'number'},minItems:2,maxItems:2},radius:{type:'number'}}},
  async execute(_id,p){const s=await load();return {...text(describeMap(s.pkg,p)),details:{version:s.version}};}});
 pi.registerTool({name:'check_point',label:'检查位置',description:'检查若干 [x,z] 点：是否可步行、是否在水上、地面高度、最近路网节点、附近 1.5 单位内的模型。放置前先用它确认。',
  parameters:{type:'object',properties:{points:{type:'array',items:{type:'array',items:{type:'number'},minItems:2,maxItems:2},minItems:1,maxItems:20}},required:['points']},
  async execute(_id,p){
   const s=await load(),g=geoOf(s);
   return text(p.points.map(([x,z])=>{const n=g.nearestNode(x,z);return {at:[x,z],walkable:g.walkable(x,z),water:g.landField(x,z)<0,height:+g.terrainHeight(x,z).toFixed(3),nearestNode:n&&{id:n.id,at:g.NODES[n.id]},landmarks:s.pkg.layout.landmarks.filter(m=>Math.hypot(m.at[0]-x,m.at[1]-z)<1.5).map(m=>m.id)};}));
  }});
 pi.registerTool({name:'apply_ops',label:'修改地图',description:`对地图包执行一批编辑（最多 40 个，建议每批 3–8 个，便于用户逐步观看）。整批原子生效：任一操作或最终校验失败则全部不生效并返回错误。可用 op：${OP_TYPES.join(', ')}。
字段：add_landmark{id,model,at:[x,z],rotation?,scale?,lift?,spotId?,parameters?}；update_landmark{id, 其余同上可选}；remove_landmark{id}；add_label{text,at,kind:dike|hill|isle|lake|city}；remove_label{text}；add_node{id,at}；move_node{id,at}；remove_node{id}；connect{a,b,mode:walk|boat}；disconnect{a,b}；set_spot{id,node?,label?,scene?,season?,heading?}。`,
  parameters:{type:'object',properties:{summary:{type:'string',description:'一句话说明这一批做了什么，会显示给用户'},ops:{type:'array',items:{type:'object'},minItems:1,maxItems:40}},required:['summary','ops']},
  execute(_id,p){
   const run=queue.then(async()=>{
    const s=await load(),r=applyOps(s.pkg,p.ops,s.spotIds);
    if(r.errors)return {...text('未生效，整批已回滚：\n'+r.errors.join('\n')),details:{rejected:true,errors:r.errors,summary:p.summary}};
    const next={...s,pkg:r.pkg,version:s.version+1};await save(next);
    return {...text(`已生效（版本 ${next.version}）：${r.changes.length} 项改动`),details:{version:next.version,summary:p.summary,changes:r.changes}};
   });
   queue=run.catch(()=>{});return run;
  }});
}
