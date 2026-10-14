import {execFileSync} from 'node:child_process';
import { build, context } from 'esbuild';
import { cp, mkdir, rm, readFile } from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {relative,resolve} from 'node:path';
execFileSync(process.execPath,['scripts/validate-map.mjs'],{stdio:'inherit'});
const manifest=JSON.parse(await readFile('public/assets/web/manifest.json','utf8'));
for(const entry of manifest.entries){
  for(const [path,expected] of [[entry.source,entry.sourceSha256],[entry.output,entry.outputSha256]]){
    const actual=createHash('sha256').update(await readFile('public'+path)).digest('hex');
    if(actual!==expected)throw Error(`Web image is stale: ${path}; regenerate delivery copies before building`);
  }
}
// Archive unused/full-size source material in Git, not in every website upload.
// Keep the actual world-model input byte-for-byte available for receipt verification.
const sourceOnly=new Set([...manifest.entries.filter(e=>!e.keepOriginalInSite).map(e=>e.source.slice(1)),'assets/world/huagang-pano.png','assets/world/huagang-multi-pano.png','assets/world/huagang-multi-inputs','assets/westlake-concept.png']);
await rm('dist',{recursive:true,force:true});
await mkdir('dist',{recursive:true});
await cp('public','dist',{recursive:true,filter:source=>!sourceOnly.has(relative(resolve('public'),resolve(source)))});
const options={entryPoints:['src/app.js'],jsx:'automatic',bundle:true,format:'esm',splitting:true,outdir:'dist',minify:true,sourcemap:false,target:'es2022',loader:{'.wasm':'file'}};
if(process.argv.includes('--watch')){
  // shortcut: public/ is copied once at startup; restart npm run dev after replacing assets.
  const ctx=await context({...options,minify:false,plugins:[{name:'report',setup(b){b.onEnd(r=>console.log(r.errors.length?'构建失败，保存修改后会自动重试':'Built dist/ · '+new Date().toLocaleTimeString('zh-CN',{hour12:false})));}}]});
  await ctx.watch();
}else{
  await build(options);
  console.log('Built dist/');
}
