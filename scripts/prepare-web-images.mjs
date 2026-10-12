// Make delivery copies; original photographs and generated artwork remain unchanged.
// Re-run on macOS only when the originals change. Builds use the checked-in copies.
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const originals=[
 'scenic/garden-map.png',
 ...['left','rear','back','top','detail'].map(v=>`completion/huagang-${v}.png`),
 'real/huagang.jpg','real/duanqiao.jpg','real/quyuan.jpg',
];
await mkdir('public/assets/web',{recursive:true});
const entries=[];
for(const name of originals){
 const source=`/assets/${name}`,output=`/assets/web/${name.replaceAll('/','-').replace(/\.(png|jpg)$/,'.jpg')}`;
 execFileSync('/usr/bin/sips',['-Z','1920','-s','format','jpeg','-s','formatOptions','85',`public${source}`,'--out',`public${output}`],{stdio:'ignore'});
 const hash=async p=>createHash('sha256').update(await readFile(p)).digest('hex');
 entries.push({source,output,sourceSha256:await hash(`public${source}`),outputSha256:await hash(`public${output}`),originalBytes:(await stat(`public${source}`)).size,webBytes:(await stat(`public${output}`)).size,keepOriginalInSite:name==='real/huagang.jpg'});
}
await writeFile('public/assets/web/manifest.json',JSON.stringify({format:'JPEG',quality:85,maxDimension:1920,changes:'Web delivery copies: resized when larger than 1920 px and JPEG-compressed; no scene or content edits.',entries},null,2)+'\n');
console.log(JSON.stringify({originalBytes:entries.reduce((n,e)=>n+e.originalBytes,0),webBytes:entries.reduce((n,e)=>n+e.webBytes,0)}));
