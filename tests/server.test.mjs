import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {existsSync} from 'node:fs';
process.env.PORT='4189';
const {route}=await import('../server.mjs');
const get=(path,host='127.0.0.1:4189')=>new Promise((resolve,reject)=>http.get({port:4189,host:'127.0.0.1',path,headers:{host}},res=>{let body='';res.on('data',d=>body+=d);res.on('end',()=>resolve({status:res.statusCode,body}));}).on('error',reject));
test('local server answers only its own host and never serves outside dist/',async()=>{
 const server=http.createServer(route);await new Promise(r=>server.listen(4189,'127.0.0.1',r));
 try{
  assert.equal((await get('/api/health','evil.example')).status,403);
  assert.deepEqual(JSON.parse((await get('/api/health')).body),{local:true});
  assert.equal((await get('/api/guide')).status,404);
  assert.equal((await get('/..%2fpackage.json')).status,403);
  assert.equal((await get('/%E0%A4%A')).status,400);
  if(existsSync('dist/index.html'))assert.equal((await get('/')).status,200);
 }finally{server.close();}
});
