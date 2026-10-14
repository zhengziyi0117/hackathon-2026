import {execFileSync} from 'node:child_process';
import { build, context } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
execFileSync(process.execPath,['scripts/sync-scenics.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['scripts/validate-scenics.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['scripts/validate-map.mjs'],{stdio:'inherit'});
const {copyScenicAssets}=await import('./scenic-assets.mjs');
await rm('dist',{recursive:true,force:true});
await mkdir('dist',{recursive:true});
await cp('public','dist',{recursive:true});
await copyScenicAssets('dist');
const options={entryPoints:['src/app.js'],jsx:'automatic',bundle:true,format:'esm',splitting:true,outdir:'dist',minify:true,sourcemap:false,target:'es2022',loader:{'.wasm':'file'}};
if(process.argv.includes('--watch')){
  // shortcut: package assets are copied once at startup; restart dev after changing assets or catalog membership.
  const ctx=await context({...options,minify:false,plugins:[{name:'report',setup(b){b.onEnd(r=>console.log(r.errors.length?'构建失败，保存修改后会自动重试':'Built dist/ · '+new Date().toLocaleTimeString('zh-CN',{hour12:false})));}}]});
  await ctx.watch();
}else{
  await build(options);
  console.log('Built dist/');
}
