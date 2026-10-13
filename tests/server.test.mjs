import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {existsSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
process.env.PORT='4189';
process.env.JINGJIAN_DATA_DIR=await mkdtemp(path.join(tmpdir(),'jingjian-'));
// Keys must stay unset so no test can reach a paid API.
for(const k of ['ANTHROPIC_API_KEY','WORLDLABS_API_KEY'])process.env[k]='';
const {route}=await import('../server.mjs');
const call=(p,{host='127.0.0.1:4189',method='GET',origin,body}={})=>new Promise((resolve,reject)=>{
 const req=http.request({port:4189,host:'127.0.0.1',path:p,method,headers:{host,...(origin?{origin}:{}),...(body?{'content-type':'application/json'}:{})}},res=>{let b='';res.on('data',d=>b+=d);res.on('end',()=>resolve({status:res.statusCode,body:b}));});
 req.on('error',reject);req.end(body);
});
test('local server answers only its own host, checks POST origin and never serves outside dist/ or data/worlds',async()=>{
 const server=http.createServer(route);await new Promise(r=>server.listen(4189,'127.0.0.1',r));
 const self='http://127.0.0.1:4189';
 try{
  assert.equal((await call('/api/health',{host:'evil.example'})).status,403);
  assert.deepEqual(JSON.parse((await call('/api/health')).body),{local:true,guide:false,world:false});
  assert.equal((await call('/api/guide',{method:'POST',origin:'http://evil.example',body:'{}'})).status,403);
  assert.equal((await call('/api/guide',{method:'POST',body:'{}'})).status,403,'POST without Origin is refused');
  assert.equal((await call('/api/guide',{method:'POST',origin:self,body:JSON.stringify({question:'讲讲'})})).status,503);
  assert.equal((await call('/api/worlds',{method:'POST',origin:self,body:JSON.stringify({requestId:'abcdefgh-1',model:'marble-1.1',images:[{angle:'front',src:'/assets/real/huagang.jpg'}]})})).status,503);
  assert.equal((await call('/api/worlds/abcdefgh-1')).status,404);
  assert.equal((await call('/generated/../../package.json')).status,404);
  assert.equal((await call('/generated/abcdefgh-1/world.spz')).status,404);
  assert.equal((await call('/..%2fpackage.json')).status,403);
  assert.equal((await call('/%E0%A4%A')).status,400);
  if(existsSync('dist/index.html'))assert.equal((await call('/')).status,200);
 }finally{server.close();await rm(process.env.JINGJIAN_DATA_DIR,{recursive:true,force:true});}
});
