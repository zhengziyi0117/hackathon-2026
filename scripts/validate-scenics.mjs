import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {scenicPackages,settings} from '../src/content/catalog.js';
import {CONTENT_CONTRACTS,validateScenicPackage} from '../src/content/contract.js';
import {schemaErrors} from '../src/map3d/contract.js';
import {root,validateAssetFiles} from './scenic-assets.mjs';
execFileSync(process.execPath,[resolve(root,'scripts/sync-scenics.mjs'),'--check'],{stdio:'inherit'});
const errors=schemaErrors(CONTENT_CONTRACTS.catalog,settings);
if(!settings.scenics.includes(settings.defaultScenic))errors.push('Default scenic is not registered');
const landing=scenicPackages.find(p=>p.manifest.id===settings.defaultScenic),featured=landing?.spots.find(o=>o.content.id===settings.featuredSpot);
if(!featured||!landing.spots.some(o=>o.content.id===settings.closingSpot))errors.push('Homepage scenic/spot references must exist');
if(featured)for(const angle of ['front','left','rear','back','top','inside'])if(!({...featured.content.photos,...featured.content.publishedPhotos})[angle])errors.push('Homepage demonstration is missing photo angle: '+angle);
const folders=(await readdir(resolve(root,'scenics'),{withFileTypes:true})).filter(e=>e.isDirectory()).map(e=>e.name).sort();
if(JSON.stringify(folders)!==JSON.stringify([...settings.scenics].sort()))errors.push('All scenic directories must be registered exactly once');
for(const pkg of scenicPackages){
 errors.push(...validateScenicPackage(pkg).map(e=>pkg.manifest.id+': '+e));
 const spots=(await readdir(resolve(root,'scenics',pkg.manifest.id,'spots'),{withFileTypes:true})).filter(e=>e.isDirectory()).map(e=>e.name).sort();
 if(JSON.stringify(spots)!==JSON.stringify([...pkg.manifest.spots].sort()))errors.push(pkg.manifest.id+': all spot directories must be registered exactly once');
}
for(const [name,schema] of Object.entries(CONTENT_CONTRACTS)){
 const path=resolve(root,'schemas/scenic-'+name+'.schema.json'),expected={$schema:'https://json-schema.org/draft/2020-12/schema',title:'Scenic package '+name,...schema};
 if(process.argv.includes('--write-schemas'))await writeFile(path,JSON.stringify(expected,null,2)+'\n');
 else if(JSON.stringify(JSON.parse(await readFile(path,'utf8')))!==JSON.stringify(expected))errors.push('Stale scenic schema: '+name);
}
let counts;try{counts=await validateAssetFiles();}catch(e){errors.push(e.message);}
const report={passed:!errors.length,scenics:settings.scenics,spots:scenicPackages.reduce((n,p)=>n+p.spots.length,0),...counts,errors};
await mkdir(resolve(root,'artifacts'),{recursive:true});await writeFile(resolve(root,'artifacts/scenic-validation.json'),JSON.stringify(report,null,2)+'\n');
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log('Scenic packages passed: '+JSON.stringify(report));
