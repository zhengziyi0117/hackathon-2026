// Rebuild checked-in delivery copies on macOS, using each owner's declared image recipe.
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {assetRecords} from '../src/content/catalog.js';
import {within,assetHash} from './scenic-assets.mjs';
const manifests=new Map();
for(const a of assetRecords.filter(a=>a.delivery)){
 const source=within(a.base,a.file),output=within(a.base,a.delivery.file);
 await mkdir(dirname(output),{recursive:true});
 execFileSync('/usr/bin/sips',['-Z',String(a.delivery.maxDimension),'-s','format','jpeg','-s','formatOptions',String(a.delivery.quality),source,'--out',output],{stdio:'ignore'});
 const file=within(a.base,'assets.json');if(!manifests.has(file))manifests.set(file,JSON.parse(await readFile(file,'utf8')));
 const entry=manifests.get(file).assets.find(e=>e.id===a.id);entry.sha256=await assetHash(source);entry.delivery.sha256=await assetHash(output);
}
for(const [file,data] of manifests)await writeFile(file,JSON.stringify(data,null,2)+'\n');
console.log('Regenerated delivery copies for '+manifests.size+' asset manifests');
