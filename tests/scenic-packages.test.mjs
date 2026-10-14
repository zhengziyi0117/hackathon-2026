import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {scenicPackages,assetRecords,assetFiles,createBuiltinScenic} from '../src/content/catalog.js';
import {validateScenicPackage} from '../src/content/contract.js';
import {assetHash,copyScenicAssets,validateAssetFiles,within} from '../scripts/scenic-assets.mjs';
import {worldAsset,worldVariants,completeDemo,upgradeWorkspace,createWorkspace} from '../src/scenic-core.js';
import {webImageUrl} from '../src/web-images.js';

test('every package joins content, geometry and assets using the same scenic/spot IDs',()=>{
 for(const p of scenicPackages){
  assert.deepEqual(validateScenicPackage(p),[]);
  const state=createBuiltinScenic(p.manifest.id);
  assert.equal(state.draft.spots.length,Object.keys(p.map.geography.spots).length);
  for(const s of state.published.spots)for(const photo of Object.values(s.photos))assert.ok(assetFiles.has(photo.url));
 }
});
test('package validation rejects missing content, missing assets and unsafe sample associations',()=>{
 for(const mutate of [
  p=>p.manifest.spots.push('missing'),
  p=>delete p.map.geography.spots.huagang,
  p=>p.spots[0].content.photos.front='missing',
  p=>p.spots[0].content.sample.binding.referenceUrl='/assets/other.jpg',
  p=>delete p.spots[0].content.sample.completion.back,
  p=>p.spots[0].assets.assets.find(a=>a.id==='single-world').publish=false,
  p=>p.spots[0].assets.assets.find(a=>a.id==='left').photo.kind='real',
  p=>p.assets.assets.push(p.assets.assets[0])
 ]){const p=structuredClone(scenicPackages[0]);mutate(p);assert.ok(validateScenicPackage(p).length);}
});
test('all package assets have one owner, valid bytes and no directory traversal',async()=>{
 const counts=await validateAssetFiles();assert.ok(counts.files>=48);
 const a=assetRecords[0];
 await assert.rejects(validateAssetFiles([a,a]),/Duplicate/);
 await assert.rejects(validateAssetFiles([{...a,sha256:'0'.repeat(64)}]),/hash is stale/);
 await assert.rejects(validateAssetFiles([{...a,file:'../manifest.json'}]),/Unsafe/);
 assert.throws(()=>within('scenics/westlake','/etc/passwd'),/Unsafe/);
});
test('old photo URLs still resolve to byte-identical originals and their delivery copies',async()=>{
 const old='/assets/real/huagang.jpg',receipt=JSON.parse(await readFile(assetFiles.get('/assets/world/huagang-generation.json'),'utf8'));
 assert.equal(await assetHash(assetFiles.get(old)),receipt.input.sha256);
 assert.equal(webImageUrl(old),'/assets/web/real-huagang.jpg');
 assert.equal(webImageUrl('idb:custom-upload'),'idb:custom-upload');
 const s=createBuiltinScenic().published.spots[0];
 assert.equal(worldAsset(s).spz,'/assets/world/huagang-500k.spz');
 assert.deepEqual(worldVariants(s).map(w=>w.id),['single','multi']);
 completeDemo(createBuiltinScenic().draft.spots[0]);
 const clone=structuredClone(s);clone.photos.front={...clone.photos.front,url:'/assets/forbidden-city/real/taihedian.jpg'};
 assert.equal(worldAsset(clone),null);assert.throws(()=>completeDemo(clone),/仅提供/);
});
test('existing edited workspaces, custom uploads and deleted built-ins survive package upgrades',()=>{
 const ws=createWorkspace();ws.scenics.pop();
 const s=ws.scenics[0];s.draft.title='我的修订';s.draft.spots[0].photos.front={url:'idb:my-photo',kind:'upload',accepted:true};
 s.published.spots[0].guide='审核后的讲解';s.publishedAt='2026-10-14T00:00:00Z';
 const before=structuredClone(ws);assert.deepEqual(upgradeWorkspace(ws),before);assert.deepEqual(upgradeWorkspace(ws),before);
});
test('publishing copies runtime files only and preserves the exact world-model input',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'scenic-delivery-'));
 try{
  await copyScenicAssets(dir);
  const original='/assets/real/huagang.jpg',model='/assets/world/huagang-500k.spz';
  for(const url of [original,model,'/assets/world/huagang-generation.json','/assets/forbidden-city/palace-scroll.jpg','/assets/web/completion-huagang-back.jpg'])assert.equal(await assetHash(join(dir,url)),await assetHash(assetFiles.get(url)));
  for(const url of ['/assets/world/huagang-pano.png','/assets/world/huagang-multi-inputs/front.jpg','/assets/completion/huagang-back.png','/assets/westlake-concept.png'])await assert.rejects(access(join(dir,url)));
 }finally{await rm(dir,{recursive:true,force:true});}
});
