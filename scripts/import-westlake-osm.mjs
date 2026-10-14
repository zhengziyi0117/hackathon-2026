// Convert extracted evidence into a geography candidate; adoption remains an explicit review step.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {distToPolyline} from '../src/westlake-geo.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const input=resolve(root,process.argv[2]||'artifacts/westlake-osm-candidate.json');
const output=resolve(root,process.argv[3]||'artifacts/westlake-geography.candidate.json');
const src=JSON.parse(await readFile(input,'utf8'));
const data=JSON.parse(await readFile(resolve(root,'src/map3d/data/westlake/geography.json'),'utf8'));
if(JSON.stringify(src.origin)!==JSON.stringify(data.frame.origin)||JSON.stringify(src.bounds)!==JSON.stringify(data.frame.bounds))throw Error('Projection or bounds changed: review the coordinate frame before importing.');
const names={duanqiao:'断桥',jindai:'锦带桥',pinghu:'平湖秋月',gushan:'孤山',xiling:'西泠桥',quyuan:'曲院风荷',yudai:'玉带桥',huxin:'湖心亭',ruangong:'阮公墩',santan:'三潭印月',huagang:'花港观鱼',leifeng:'雷峰塔',xizhao:'夕照山',baochu:'保俶塔',baoshi:'宝石山',nanping:'南屏山'};
for(const [id,name] of Object.entries(names)){if(!src.poi[name]?.[0])throw Error('Missing POI: '+name);data.places[id]=src.poi[name][0].slice(0,2);}
if(!src.poi['三潭印月']?.[1])throw Error('Missing Xiaoyingzhou position');
data.places.xiaoyingzhou=src.poi['三潭印月'][1].slice(0,2);
data.water=src.water;data.provenance.fetched=src.fetched;
for(const c of data.causeways.filter(c=>['su','bai'].includes(c.id))){
 c.points=src[c.id];for(const b of c.bridges){const p=src.poi[b.name]?.[0];if(!p)throw Error('Missing bridge: '+b.name);b.t=distToPolyline(...p.slice(0,2),c.points).along;}
}
for(const [id,place] of Object.entries({huagang:'huagang',duanqiao:'duanqiao',pinghu:'pinghu',quyuan:'quyuan',santan:'santan',leifeng:'leifeng'}))data.spots[id].label=data.places[place];
await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(data,null,2)+'\n');
console.log('Wrote geography candidate:',output);
console.log('Review road snapping, bridge joins and model placement before replacing geography.json and validating.');
