import {CONTRACTS} from '../src/map3d/contract.js';
import {writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../schemas/',import.meta.url);await mkdir(root,{recursive:true});
for(const [name,schema] of Object.entries(CONTRACTS))await writeFile(new URL('map-'+name+'.schema.json',root),JSON.stringify({$schema:'https://json-schema.org/draft/2020-12/schema',title:'Scenic Map v1 — '+name,...schema},null,2)+'\n');
console.log('Updated six map schemas in',fileURLToPath(root));
