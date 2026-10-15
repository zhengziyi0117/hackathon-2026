// Map agent runs: one `pi --mode rpc` child per run, using whatever model and credentials pi itself is configured with.
// The child gets only the three map tools (agent/map-tools.mjs); no shell, no file tools, no project context.
// Browser ⇄ server: SSE events out, steer/stop/state in. The package of record is the run's state file.
import {spawn,execFile} from 'node:child_process';
import {mkdir,writeFile,readFile,rm,rename} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {describeMap} from '../src/map3d/ops.js';
import {checkMapPackage} from '../src/map3d/packages.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const ENV=process.env,PI=ENV.JINGJIAN_PI_BIN||'pi',IDLE_MS=20*60*1000,MAX_EVENTS=4000;
const runs=new Map();
let readyCache;
// Whether a pi CLI is installed; checked once per process.
export const agentReady=()=>readyCache??=new Promise(r=>execFile(PI,['--version'],{timeout:8000},err=>r(!err)));

const SYSTEM=`你是「景见」的三维景区地图制作 Agent。用户在浏览器里实时看着你一步一步修改三维微缩地图，并随时插话调整方向。
工作方式：
- 始终用简体中文回复，包括批与批之间的说明。
- 先用 inspect_map / check_point 了解地图，再用 apply_ops 分批修改。每批 3–8 个操作，按空间区域或主题分组（先路网，再模型，再地名），让用户看得清过程。
- 每批的 summary 用一句中文说明在做什么。批与批之间用一两句话告诉用户你接下来打算做什么。
- 坐标单位：1 = 100 米，x 向东，z 向南，水面 y=0。陆上模型不能放在水里，路段不能穿水。放置前用 check_point 确认。
- 只能使用工具描述里的模型 ID 和操作。不能修改湖岸、水体、地形、建筑实体，它们是地理事实。
- 景点（spot）只能是景区内容里已有的 ID；不要编造史实、名称或数据。不确定的地方，在说明里标注“展示性布置，需景区核对”。
- apply_ops 被拒绝时，阅读错误、修正后重试，不要重复同一错误。
- 用户插话时，以用户最新的要求为准，调整计划后继续。用户说地图被外部改动时，先 inspect_map 再继续。
- 完成后用两三句话总结改了什么、还需要人工核对什么。`;

function emit(run,event){
 event.seq=++run.seq;run.events.push(event);if(run.events.length>MAX_EVENTS)run.events.splice(0,run.events.length-MAX_EVENTS);
 for(const res of run.clients)res.write(`id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`);
}
// Turn pi RPC records into the few events the builder UI needs.
function translate(run,r){
 if(r.type==='message_update'){const u=r.assistantMessageEvent;if(u?.type==='text_delta')emit(run,{type:'text',delta:u.delta});return;}
 if(r.type==='message_start'&&r.message?.role==='assistant')return emit(run,{type:'message'});
 if(r.type==='message_end'&&r.message?.role==='assistant'&&r.message.stopReason==='error')return emit(run,{type:'error',message:r.message.errorMessage||'模型调用失败'});
 if(r.type==='tool_execution_start')return emit(run,{type:'tool',id:r.toolCallId,name:r.toolName,args:r.toolName==='apply_ops'?{summary:r.args?.summary,count:r.args?.ops?.length}:r.args});
 if(r.type==='tool_execution_end'){
  const d=r.result?.details||{},out={type:'tool_end',id:r.toolCallId,name:r.toolName,isError:Boolean(r.isError)};
  if(r.toolName==='apply_ops'){
   if(d.rejected)Object.assign(out,{rejected:true,errors:d.errors,summary:d.summary});
   else if(d.version){Object.assign(out,{version:d.version,summary:d.summary,changes:d.changes});return readState(run).then(s=>{if(s.version===d.version)out.pkg=s.pkg;emit(run,out);}).catch(()=>emit(run,out));}
  }
  return emit(run,out);
 }
 if(r.type==='agent_start')return emit(run,{type:'busy',busy:true});
 if(r.type==='agent_settled')return emit(run,{type:'busy',busy:false});
 if(r.type==='auto_retry_start')return emit(run,{type:'notice',message:`模型繁忙，${Math.round(r.delayMs/1000)} 秒后重试`});
 if(r.type==='response'&&!r.success)return emit(run,{type:'error',message:r.error||'命令失败'});
}
const readState=run=>readFile(run.statePath,'utf8').then(JSON.parse);
async function writeState(run,state){await writeFile(run.statePath+'.tmp',JSON.stringify(state));await rename(run.statePath+'.tmp',run.statePath);}
function command(run,cmd){if(run.proc.exitCode===null&&run.proc.stdin.writable)run.proc.stdin.write(JSON.stringify(cmd)+'\n');}
function touch(run){clearTimeout(run.idle);run.idle=setTimeout(()=>closeRun(run.id),IDLE_MS);}

export async function closeRun(id){
 const run=runs.get(id);if(!run)return;runs.delete(id);clearTimeout(run.idle);
 emit(run,{type:'closed'});for(const res of run.clients)res.end();
 run.proc.stdin.end();setTimeout(()=>run.proc.kill(),3000).unref();
 await rm(run.dir,{recursive:true,force:true}).catch(()=>{});
}

// data: {pkg, spotIds, spotNames, prompt}. One run at a time: a new run closes the old ones.
export async function startRun(data,dataRoot){
 if(!await agentReady())throw Object.assign(Error('本机没有可用的 pi 命令。'),{status:503});
 const spotIds=Array.isArray(data.spotIds)?data.spotIds.filter(x=>typeof x==='string').slice(0,200):[];
 const errors=checkMapPackage(data.pkg,spotIds);
 if(errors.length)throw Object.assign(Error('地图包未通过校验：'+errors.slice(0,3).join('；')),{status:400});
 const prompt=typeof data.prompt==='string'?data.prompt.trim().slice(0,2000):'';
 if(!prompt)throw Object.assign(Error('请告诉 Agent 要做什么。'),{status:400});
 for(const id of [...runs.keys()])await closeRun(id);
 const id=randomUUID(),dir=path.join(dataRoot,'map-agent',id),statePath=path.join(dir,'state.json');
 await mkdir(dir,{recursive:true});
 const pkg=Object.fromEntries(['manifest','geography','layout','interaction'].map(k=>[k,data.pkg[k]]));
 await writeFile(statePath,JSON.stringify({pkg,spotIds,version:0}));
 const args=['--mode','rpc','--no-session','--no-context-files','--no-skills','--no-prompt-templates','--no-mcp','--no-builtin-tools',
  '-e',path.join(here,'map-tools.mjs'),'--tools','inspect_map,check_point,apply_ops','--system-prompt',SYSTEM];
 if(ENV.MAP_AGENT_MODEL)args.push('--model',ENV.MAP_AGENT_MODEL);
 args.push('--thinking',ENV.MAP_AGENT_THINKING||'low');
 // The child must not inherit this machine's interactive pi session (when the server itself runs inside pi).
 const env={...ENV,JINGJIAN_MAP_STATE:statePath};for(const k of Object.keys(env))if(/^PI_(SESSION|PROVIDER|MODEL|REASONING|CODING_AGENT)/.test(k))delete env[k];
 const proc=spawn(PI,args,{cwd:dir,env,stdio:['pipe','pipe','pipe']});
 const run={id,dir,statePath,proc,events:[],clients:new Set(),idle:null,seq:0};runs.set(id,run);touch(run);
 let buf='',err='';
 proc.stdout.on('data',chunk=>{buf+=chunk;let i;while((i=buf.indexOf('\n'))>=0){const line=buf.slice(0,i).replace(/\r$/,'');buf=buf.slice(i+1);if(!line)continue;let r;try{r=JSON.parse(line);}catch{continue;}translate(run,r);}});
 proc.stderr.on('data',d=>{err=(err+d).slice(-2000);});
 proc.on('error',e=>emit(run,{type:'error',message:'启动 pi 失败：'+e.message}));
 proc.on('exit',code=>{if(runs.has(id)){emit(run,{type:'error',message:`Agent 进程已退出（${code}）${err?'：'+err.trim().split('\n').at(-1):''}`});closeRun(id);}});
 const names=data.spotNames&&typeof data.spotNames==='object'?Object.fromEntries(spotIds.map(s=>[s,String(data.spotNames[s]||'').slice(0,40)])):{};
 command(run,{type:'prompt',message:`当前地图概览：${JSON.stringify(describeMap(pkg))}\n景区内容里的景点：${JSON.stringify(names)}\n\n用户的要求：${prompt}`});
 return {id};
}

export function streamRun(id,req,res){
 const run=runs.get(id);if(!run)return false;
 res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','Connection':'keep-alive','X-Content-Type-Options':'nosniff'});
 // EventSource reconnects send Last-Event-ID; replay only what the browser has not seen.
 const after=Number(req.headers['last-event-id'])||0;
 for(const e of run.events)if(e.seq>after)res.write(`id: ${e.seq}\ndata: ${JSON.stringify(e)}\n\n`);
 run.clients.add(res);req.on('close',()=>run.clients.delete(res));return true;
}
// While the agent works, a message steers the current run; when idle it starts the next turn.
export function sendMessage(id,data){
 const run=runs.get(id);if(!run)return false;touch(run);
 const message=typeof data.message==='string'?data.message.trim().slice(0,2000):'';
 if(!message)throw Object.assign(Error('消息为空。'),{status:400});
 const busy=run.events.findLast(e=>e.type==='busy')?.busy,note=run.pendingNote||'';run.pendingNote=null;
 command(run,busy?{type:'steer',message}:{type:'prompt',message:note?note+'\n\n'+message:message});
 emit(run,{type:'user',message,steer:Boolean(busy)});return true;
}
export function stopRun(id){const run=runs.get(id);if(!run)return false;command(run,{type:'abort'});emit(run,{type:'notice',message:'已暂停，发消息可继续'});return true;}
// The builder reverted to an earlier step (or edited by hand): replace the package and tell the agent.
export async function replaceState(id,data){
 const run=runs.get(id);if(!run)return false;touch(run);
 const s=await readState(run),errors=checkMapPackage(data.pkg,s.spotIds);
 if(errors.length)throw Object.assign(Error('地图包未通过校验：'+errors.slice(0,3).join('；')),{status:400});
 const next={...s,pkg:Object.fromEntries(['manifest','geography','layout','interaction'].map(k=>[k,data.pkg[k]])),version:s.version+1};
 await writeState(run,next);
 const note=`【系统】用户${typeof data.reason==='string'?data.reason.slice(0,200):'在外部修改了地图'}，地图已是版本 ${next.version}。请先 inspect_map 再继续。`;
 const busy=run.events.findLast(e=>e.type==='busy')?.busy;if(busy)command(run,{type:'steer',message:note});else run.pendingNote=note;
 emit(run,{type:'state',version:next.version});return true;
}
