import miniature from './styles/miniature.json' with {type:'json'};
import papercraft from './styles/papercraft.json' with {type:'json'};
import voxel from './styles/voxel.json' with {type:'json'};
import bricks from './styles/bricks.json' with {type:'json'};
import adventure from './styles/adventure.json' with {type:'json'};
import {MAP_PACKAGES} from './data/catalog.js';
import {validatePackage,spatialErrors} from './contract.js';
import {createGeography} from './geography.js';
export {MAP_PACKAGES,mapPackageFor} from './data/catalog.js';
export const STYLES={miniature,papercraft,voxel,bricks,adventure};
export function styleFor(pkg,id){return STYLES[pkg.manifest.styles.includes(id)?id:pkg.manifest.defaultStyle];}

const BUILT_IN={...MAP_PACKAGES};
const LAYERS=['manifest','geography','layout','interaction'];
// Runtime packages come from the scenic workspace (studio import / generation agent), not from the bundle.
// Returns the errors; an invalid package is never registered. styles must be built-in style ids.
export function checkMapPackage(data,spotIds){
 if(!data||typeof data!=='object')return ['地图包为空'];
 const pkg=Object.fromEntries(LAYERS.map(k=>[k,data[k]])),ids=Array.isArray(pkg.manifest?.styles)?pkg.manifest.styles:[];
 const unknown=ids.filter(id=>!STYLES[id]);if(unknown.length)return ['manifest.styles: 不支持的风格 '+unknown.join(', ')];
 const errors=validatePackage(pkg,Object.fromEntries(ids.map(id=>[id,STYLES[id]])));
 if(errors.length)return errors;
 if(spotIds){const known=new Set(spotIds);for(const id of Object.keys(pkg.geography.spots))if(!known.has(id))errors.push('geography.spots.'+id+': 景区里没有这个景点 ID');}
 return errors.length?errors:spatialErrors(pkg,createGeography(pkg.geography,pkg.interaction));
}
// key is the scenic id (or 'draft:<id>' for studio previews). Passing null restores the bundled package, if any.
export function registerMapPackage(key,data){
 if(!data){if(BUILT_IN[key])MAP_PACKAGES[key]=BUILT_IN[key];else delete MAP_PACKAGES[key];return [];}
 const errors=checkMapPackage(data);if(errors.length)return errors;
 const pkg=Object.fromEntries(LAYERS.map(k=>[k,structuredClone(data[k])]));
 MAP_PACKAGES[key]={...pkg,geo:createGeography(pkg.geography,pkg.interaction),runtime:true};
 return [];
}
// The bundled package as a plain object, so staff or an agent can start from a known-good template.
export const packageData=key=>{const p=MAP_PACKAGES[key];return p?Object.fromEntries(LAYERS.map(k=>[k,structuredClone(p[k])])):null;};
