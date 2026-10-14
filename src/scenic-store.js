import {createWorkspace,upgradeWorkspace,copy,photoRefs,refsIn,REF} from './scenic-core.js';
import {registerImage} from './web-images.js';
// The workspace object holds only small 'idb:<sha256>' references; image bytes live as Blobs in their own store,
// shared by draft and published, so the number of photos is bounded by disk quota, not by one IndexedDB value.
let state, dbPromise, writes=Promise.resolve();
const fresh=new Set();
function db() {
  return dbPromise ||= new Promise((resolve,reject)=>{
    const req=indexedDB.open('jingjian-scenic-workspace',2);
    req.onupgradeneeded=()=>{const d=req.result;if(!d.objectStoreNames.contains('workspace'))d.createObjectStore('workspace');if(!d.objectStoreNames.contains('photos'))d.createObjectStore('photos');};
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
}
const tx=(d,stores,mode,fn)=>new Promise((resolve,reject)=>{const t=d.transaction(stores,mode);const out=fn(t);t.oncomplete=()=>resolve(out?.result);t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error);});
async function storeBlob(blob){
  const key=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(b=>b.toString(16).padStart(2,'0')).join('');
  await tx(await db(),'photos','readwrite',t=>t.objectStore('photos').put(blob,key));
  fresh.add(key);registerImage(REF+key,URL.createObjectURL(blob));return REF+key;
}
async function migrateDataURLs(value){
  let changed=false;
  for(const p of photoRefs(value))if(p.url?.startsWith('data:')){p.url=await storeBlob(await (await fetch(p.url)).blob());changed=true;}
  return changed;
}
async function preload(value){
  const d=await db();
  for(const key of refsIn(value)){const blob=await tx(d,'photos','readonly',t=>t.objectStore('photos').get(key));if(blob)registerImage(REF+key,URL.createObjectURL(blob));}
}
// Resolves to the whole workspace {schema:8,scenics:[…]}.
export async function loadScenic() {
  if(state)return state;
  try {
    const d=await db();
    const value=await tx(d,'workspace','readonly',t=>t.objectStore('workspace').get('current'));
    const next=upgradeWorkspace(value);
    if(await migrateDataURLs(next))await saveScenic(next);
    await preload(next);state=next;
  }catch{state=createWorkspace();}
  return state;
}
export function saveScenic(value) {
  const snapshot=copy(value);
  const write=writes.catch(()=>{}).then(async()=>{
    const d=await db();
    await tx(d,'workspace','readwrite',t=>t.objectStore('workspace').put(snapshot,'current'));state=value;
    // Drop image blobs no snapshot references any more; keys stored this session are kept in case an upload is mid-flight.
    const used=refsIn(snapshot),keys=await tx(d,'photos','readonly',t=>t.objectStore('photos').getAllKeys());
    const orphans=keys.filter(k=>!used.has(k)&&!fresh.has(k));
    if(orphans.length)await tx(d,'photos','readwrite',t=>{for(const k of orphans)t.objectStore('photos').delete(k);});
  });
  writes=write;return write;
}
export async function imageFile(file) {
  if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('请选择 JPG、PNG 或 WebP 图片');
  if(file.size>12*1024*1024)throw Error('每张图片请控制在 12 MB 以内');
  const bitmap=await createImageBitmap(file).catch(()=>{throw Error('这张图片无法读取，请重新选择');});
  if(bitmap.width<100||bitmap.height<100){bitmap.close();throw Error('图片太小，请使用至少 100 × 100 像素的图片');}bitmap.close();
  return {url:await storeBlob(file),name:file.name,kind:'upload',accepted:true};
}
// Backups stay self-contained: references are inlined back to data URLs.
export async function exportState(value){
  const out=copy(value),d=await db();
  for(const p of photoRefs(out))if(p.url?.startsWith(REF)){const blob=await tx(d,'photos','readonly',t=>t.objectStore('photos').get(p.url.slice(REF.length)));if(blob)p.url=await new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result);f.readAsDataURL(blob);});}
  return out;
}
