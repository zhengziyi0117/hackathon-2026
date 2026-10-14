import {readFile,mkdir,copyFile,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assetRecords} from '../src/content/catalog.js';
export const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const assetHash=async file=>createHash('sha256').update(await readFile(file)).digest('hex');
export function within(base,file){
 if(typeof file!=='string'||file.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('Unsafe asset path: '+file);
 const dir=resolve(root,base),path=resolve(dir,file);if(!path.startsWith(dir+sep))throw Error('Asset escapes package: '+file);return path;
}
export async function validateAssetFiles(records=assetRecords){
 const urls=new Set(),files=new Set();
 for(const a of records)for(const entry of [a,...(a.delivery?[a.delivery]:[])]){
  const source=within(a.base,entry.file);within('dist',entry.url.replace(/^\//,''));
  if(!entry.url.startsWith('/assets/')||urls.has(entry.url)||files.has(source))throw Error('Duplicate/invalid asset ownership: '+entry.url);
  urls.add(entry.url);files.add(source);
  if(await realpath(source)!==source)throw Error('Asset symlinks are not supported: '+source);
  if(await assetHash(source)!==entry.sha256)throw Error('Asset hash is stale: '+source);
 }
 return {files:files.size,urls:urls.size};
}
export async function copyScenicAssets(destination){
 for(const a of assetRecords)for(const e of [...(a.publish?[a]:[]),...(a.delivery?[a.delivery]:[])]){
  const source=within(a.base,e.file),output=within(destination,e.url.slice(1));
  await mkdir(dirname(output),{recursive:true});await copyFile(source,output);
 }
}
