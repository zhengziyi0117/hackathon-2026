import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {CONTRACTS,validatePackage,spatialErrors} from '../src/map3d/contract.js';
import {createGeography} from '../src/map3d/geography.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const manifestFile=resolve(root,process.argv[2]||'src/map3d/data/westlake/manifest.json');
const hashes={};
async function load(file){const bytes=await readFile(file);hashes[relative(root,file)]=createHash('sha256').update(bytes).digest('hex');return JSON.parse(bytes);}
const manifest=await load(manifestFile),base=dirname(manifestFile),pkg={manifest};
for(const key of ['geography','layout','interaction']){
 if(typeof manifest[key]!=='string'||!manifest[key].startsWith('./')||manifest[key].includes('..'))throw Error('Expected a sibling JSON file: '+key);
 pkg[key]=await load(resolve(base,manifest[key]));
}
const styles={};for(const id of manifest.styles){if(!/^[a-z][a-z0-9-]*$/.test(id))throw Error('Invalid style id');styles[id]=await load(resolve(root,'src/map3d/styles',id+'.json'));}
const errors=validatePackage(pkg,styles);
if(!errors.length){
 const g=createGeography(pkg.geography,pkg.interaction);
 errors.push(...spatialErrors(pkg,g));
 // Keep published editor schemas aligned with the executable contract.
 for(const [name,schema] of Object.entries(CONTRACTS)){const saved=JSON.parse(await readFile(resolve(root,'schemas/map-'+name+'.schema.json'),'utf8'));delete saved.$schema;delete saved.title;if(JSON.stringify(saved)!==JSON.stringify(schema))errors.push('Editor schema is stale: '+name);}
}
const report={schemaVersion:1,mapId:manifest.id,checkedAt:new Date().toISOString(),passed:errors.length===0,errors,inputs:hashes,
 counts:{waterRings:pkg.geography.water.length,nodes:Object.keys(pkg.geography.network.nodes).length,edges:pkg.geography.network.edges.length,models:pkg.layout.landmarks.length,styles:manifest.styles.length},
 manualReview:['Inspect both styles at overview and landmark scale.','Verify mouse/keyboard travel, season changes and world entry.','A geometry check is not a field survey.']};
await mkdir(resolve(root,'artifacts'),{recursive:true});await writeFile(resolve(root,'artifacts/map-validation.json'),JSON.stringify(report,null,2)+'\n');
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log('Map package v1 passed:',JSON.stringify(report.counts));
