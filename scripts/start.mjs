import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
// npm start: build once, serve, open the browser. npm run dev: same, but rebuild on every src/ change.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dev=process.argv.includes('--dev');
if(!existsSync(path.join(root,'node_modules','esbuild'))){console.error('还没有安装依赖，请先在项目目录运行：npm install（或 pnpm install）');process.exit(1);}
let port=process.env.PORT||'4173';try{const text=await readFile(path.join(root,'.env'),'utf8');port=text.match(/^PORT=(\d+)$/m)?.[1]||port;}catch{}
const url=`http://127.0.0.1:${port}`;
const children=[];
const stop=code=>{for(const c of children)c.kill('SIGINT');process.exit(code);};
process.on('SIGINT',()=>stop(0));process.on('SIGTERM',()=>stop(0));
function open(){if(process.platform==='darwin')spawn('open',[url],{stdio:'ignore'});else if(process.platform==='win32')spawn('cmd',['/c','start','',url],{stdio:'ignore'});else spawn('xdg-open',[url],{stdio:'ignore'}).on('error',()=>{});console.log(`\n  景见已启动：${url}\n  维护端：${url}/#studio\n  ${dev?'修改 src/ 后自动重新构建，刷新浏览器即可。':'修改代码后重新运行 npm start，或改用 npm run dev。'}按 Ctrl+C 停止。\n`);}
// Build first, so an already-running server also picks up the latest code.
const builder=spawn(process.execPath,[path.join(root,'scripts','build.mjs'),...(dev?['--watch']:[])],{cwd:root,stdio:['ignore','pipe','inherit']});children.push(builder);
await new Promise(resolve=>{
  builder.stdout.on('data',data=>{process.stdout.write(data);if(/Built dist|构建失败/.test(data.toString()))resolve();});
  builder.on('exit',code=>{if(code){console.error('构建失败，请查看上方错误。');stop(code);}resolve();});
});
try{const r=await fetch(url+'/api/health',{signal:AbortSignal.timeout(800)});const data=await r.json();if(r.ok&&data.local){console.log('景见服务已经在运行，直接打开。');open();if(!dev)stop(0);}}
catch{
  const server=spawn(process.execPath,[path.join(root,'server.mjs')],{cwd:root,stdio:['inherit','pipe','inherit']});children.push(server);
  let opened=false;server.stdout.on('data',data=>{process.stdout.write(data);if(!opened&&data.toString().includes('景见本地服务')){opened=true;open();}});
  server.on('exit',code=>stop(code||0));
}
