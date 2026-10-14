import {readFile,mkdir,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {CONTRACTS,validatePackage} from '../src/map3d/contract.js';
import {createGeography} from '../src/map3d/geography.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const manifestFile=resolve(root,process.argv[2]||'scenics/westlake/map/manifest.json');
if(!process.argv[2]){
 const {execFileSync}=await import('node:child_process');
 const catalog=JSON.parse(await readFile(resolve(root,'scenics/catalog.json'),'utf8'));
 for(const id of catalog.scenics)execFileSync(process.execPath,[fileURLToPath(import.meta.url),resolve(root,'scenics',id,'map/manifest.json')],{stdio:'inherit'});
 process.exit(0);
}
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
 for(const [id,at] of Object.entries(g.NODES))if(!g.walkable(...at))errors.push('Node is not walkable: '+id);
 for(const edge of g.EDGES.filter(e=>e.mode==='walk')){
  const [ax,az]=g.NODES[edge.a],[bx,bz]=g.NODES[edge.b],n=Math.ceil(edge.length/.03);
  for(let i=0;i<=n;i++)if(!g.walkable(ax+(bx-ax)*i/n,az+(bz-az)*i/n)){errors.push('Walking edge crosses water/obstacle: '+edge.a+' → '+edge.b);break;}
 }
 const ids=Object.keys(g.SPOT_GEO);
 if(pkg.interaction.presentation){for(const id of ids){const n=g.SPOT_GEO[id].node;if(!g.shortestPath(pkg.interaction.startNode,n))errors.push('Spot unreachable from entry: '+id);if(!pkg.interaction.presentation.exitNodes.some(exit=>g.shortestPath(n,exit)))errors.push('No exit from spot: '+id);}}
 else for(const a of ids)for(const b of ids)if(a!==b&&!g.shortestPath(g.SPOT_GEO[a].node,g.SPOT_GEO[b].node))errors.push('Unreachable spot: '+a+' → '+b);
 for(const model of pkg.layout.landmarks){if(!['arch-bridge','three-lanterns','lake-terrace'].includes(model.model)&&g.landField(...model.at)<0&&!g.architecture?.entities.some(e=>e.kind==='passage'&&Math.abs(model.at[0]-e.at[0])<=e.size[0]/2+.1&&Math.abs(model.at[1]-e.at[1])<=e.size[1]/2+.1))errors.push('Land model is in water: '+model.id);}
 // Keep published editor schemas aligned with the executable contract.
 for(const [name,schema] of Object.entries(CONTRACTS)){const saved=JSON.parse(await readFile(resolve(root,'schemas/map-'+name+'.schema.json'),'utf8'));delete saved.$schema;delete saved.title;if(JSON.stringify(saved)!==JSON.stringify(schema))errors.push('Editor schema is stale: '+name);}
}
const report={schemaVersion:1,mapId:manifest.id,checkedAt:new Date().toISOString(),passed:errors.length===0,errors,inputs:hashes,
 counts:{waterRings:pkg.geography.water.length,nodes:Object.keys(pkg.geography.network.nodes).length,edges:pkg.geography.network.edges.length,models:pkg.layout.landmarks.length,styles:manifest.styles.length},
 manualReview:['Inspect every declared style at overview and landmark scale.','Verify mouse/keyboard travel, season changes and world entry.','A geometry check is not a field survey.']};
await mkdir(resolve(root,'artifacts'),{recursive:true});await writeFile(resolve(root,'artifacts/map-validation-'+manifest.id+'.json'),JSON.stringify(report,null,2)+'\n');
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log(`Map package v${manifest.schemaVersion} ${manifest.id} passed:`,JSON.stringify(report.counts));
