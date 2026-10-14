import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
// Exercises the Marble and Claude proxies against a stubbed fetch; nothing leaves this machine.
const dir=await mkdtemp(path.join(tmpdir(),'jingjian-proxy-'));
Object.assign(process.env,{PORT:'4190',JINGJIAN_DATA_DIR:dir,WORLDLABS_API_KEY:'test-key',ANTHROPIC_API_KEY:'test-key',ANTHROPIC_BASE_URL:'https://llm.test'});
const {createWorld,pollWorld,askGuide}=await import('../server.mjs');
const calls=[];let polls=0,generateStatus=200;
globalThis.fetch=async(url,opt={})=>{
 url=String(url);calls.push([opt.method||'GET',url]);
 const ok=data=>new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json'}});
 if(url.endsWith('media-assets:prepare_upload'))return ok({media_asset:{id:'m'+calls.length},upload_info:{upload_url:'https://upload.test/'+calls.length,upload_method:'PUT',required_headers:{}}});
 if(url.startsWith('https://upload.test/'))return new Response('',{status:200});
 if(url.endsWith('worlds:generate')){calls.at(-1).push(JSON.parse(opt.body));return generateStatus===200?ok({operation_id:'op-12345678',done:false}):new Response('{}',{status:generateStatus});}
 if(url.includes('/operations/'))return ok(++polls<2?{done:false,metadata:{progress:{status:'IN_PROGRESS',description:'World generation in progress'}}}
   :{done:true,cost:{total_credits:250},response:{id:'world-abcdef12',assets:{splats:{spz_urls:{'500k':'https://cdn.test/w.spz'},semantics_metadata:{metric_scale_factor:2,ground_plane_offset:1.5}}}}});
 if(url==='https://cdn.test/w.spz')return new Response(Buffer.from('SPZDATA'));
 if(url==='https://llm.test/v1/messages'){calls.at(-1).push(JSON.parse(opt.body),opt.headers);return ok({content:[{type:'text',text:'好的：{"text":"这里是西湖十景之一。","known":true}'}]});}
 throw Error('unexpected fetch '+url);
};
test('world job uploads each view, submits multi-image with azimuths, polls, downloads once and never double-submits',async()=>{
 const tiny='data:image/png;base64,'+Buffer.from('png').toString('base64');
 const req={requestId:'req-00000001',model:'marble-1.0-draft',name:'御碑亭',images:[{angle:'front',src:'/assets/real/huagang.jpg',kind:'real'},{angle:'back',src:tiny,kind:'ai-demo'}]};
 const job=await createWorld(req);
 assert.equal(job.status,'running');
 const gen=calls.find(c=>c[1].endsWith('worlds:generate'))[2];
 assert.equal(gen.model,'marble-1.0-draft');assert.equal(gen.world_prompt.type,'multi-image');
 assert.deepEqual(gen.world_prompt.multi_image_prompt.map(p=>p.azimuth),[0,180]);
 const before=calls.length;assert.equal((await createWorld(req)).status,'running');assert.equal(calls.length,before,'same request id is not resubmitted');
 assert.equal((await pollWorld('req-00000001')).progress,'World generation in progress');
 const [a,b]=await Promise.all([pollWorld('req-00000001'),pollWorld('req-00000001')]);
 assert.equal(a.status,'done');assert.deepEqual(a.result,b.result);
 assert.deepEqual(a.result,{worldId:'world-abcdef12',spz:'/generated/world-abcdef12/world.spz',receipt:'/generated/world-abcdef12/receipt.json',credits:250});
 assert.equal(calls.filter(c=>c[1]==='https://cdn.test/w.spz').length,1);
 const receipt=JSON.parse(await readFile(path.join(dir,'worlds/world-abcdef12/receipt.json'),'utf8'));
 assert.deepEqual(receipt.view.home,[0,1.5,0]);assert.equal(receipt.semantics.metric_scale_factor,2);
 assert.equal(await readFile(path.join(dir,'worlds/world-abcdef12/world.spz'),'utf8'),'SPZDATA');
});
test('world requests are validated before anything is uploaded, and a definite rejection is not kept',async()=>{
 const n=calls.length;
 await assert.rejects(createWorld({requestId:'req-00000002',model:'marble-9',images:[{angle:'front',src:'/assets/real/huagang.jpg'}]}),/模型/);
 await assert.rejects(createWorld({requestId:'req-00000003',model:'marble-1.1',images:[{angle:'top',src:'/assets/real/huagang.jpg'}]}),/方向/);
 await assert.rejects(createWorld({requestId:'req-00000004',model:'marble-1.1',images:[{angle:'front',src:'/../package.json'}]}),/格式/);
 await assert.rejects(createWorld({requestId:'req-00000005',model:'marble-1.1',images:[{angle:'front',src:'file:///etc/passwd'}]}),/格式/);
 assert.equal(calls.length,n);
 generateStatus=402;
 await assert.rejects(createWorld({requestId:'req-00000006',model:'marble-1.1',images:[{angle:'front',src:'/assets/real/huagang.jpg'}]}),/额度不足/);
 await assert.rejects(pollWorld('req-00000006'),/未找到/);
 generateStatus=503;
 assert.equal((await createWorld({requestId:'req-00000007',model:'marble-1.1',images:[{angle:'front',src:'/assets/real/huagang.jpg'}]})).status,'uncertain','a 5xx may have billed; keep it for review');
 generateStatus=200;
});
test('guide sends the material as system context with Anthropic headers and parses the JSON answer',async()=>{
 const out=await askGuide({name:'花港观鱼',guide:'花港观鱼是西湖十景之一。',notice:'',question:'讲讲这里',history:[{role:'assistant',text:'你好'},{role:'user',text:'在吗'},{role:'assistant',text:'在的'}]});
 assert.deepEqual(out,{text:'这里是西湖十景之一。',known:true,mode:'llm'});
 const [,,body,headers]=calls.find(c=>c[1]==='https://llm.test/v1/messages');
 assert.equal(headers['x-api-key'],'test-key');assert.equal(headers['anthropic-version'],'2023-06-01');
 assert.match(body.system,/花港观鱼是西湖十景之一/);
 assert.deepEqual(body.messages.map(m=>m.role),['user','assistant','user'],'history starts with the user and alternates');
 assert.equal(body.messages.at(-1).content,'讲讲这里');
 await rm(dir,{recursive:true,force:true});
});
