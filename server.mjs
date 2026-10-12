import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
// Local static server for dist/. The public site is the same static build; there is no backend API.
const root=path.dirname(fileURLToPath(import.meta.url));
try{const env=await readFile(path.join(root,'.env'),'utf8');for(const line of env.split('\n')){const m=line.match(/^([A-Z_]+)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].trim().replace(/^['"]|['"]$/g,'');}}catch{}
const PORT=Number(process.env.PORT)||4173;
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.json':'application/json','.wasm':'application/wasm','.txt':'text/plain; charset=utf-8'};
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
export async function route(req,res){
  const host=req.headers.host||'';
  if(!new RegExp(`^(127\\.0\\.0\\.1|localhost):${PORT}$`).test(host))return json(res,403,{error:'仅允许本机访问。'});
  try{
    const url=new URL(req.url,'http://'+host);
    if(url.pathname==='/api/health')return json(res,200,{local:true});
    if(url.pathname.startsWith('/api/'))return json(res,404,{error:'接口不存在。'});
    if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{error:'不支持此方法。'});
    const publicRoot=path.join(root,'dist'),target=path.resolve(publicRoot,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
    if(!target.startsWith(publicRoot+path.sep))return json(res,403,{error:'禁止访问。'});
    try{const data=await readFile(target);res.writeHead(200,{'Content-Type':TYPES[path.extname(target)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:data);}
    catch{return json(res,404,{error:'未找到文件。请先运行 npm run build。'});}
  }catch{return json(res,400,{error:'请求格式不正确。'});}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))http.createServer(route).listen(PORT,'127.0.0.1',()=>console.log(`景见本地服务 http://127.0.0.1:${PORT}`));
