import {scenicPackages} from '../../content/catalog.js';
import {createGeography} from '../geography.js';
// All scenic content and geometry come from the same package registry.
export const sources=scenicPackages.map(p=>p.map);
export const MAP_PACKAGES=Object.fromEntries(sources.map(p=>[p.manifest.id,{...p,geo:createGeography(p.geography,p.interaction)}]));
export const mapPackageFor=id=>MAP_PACKAGES[id]||null;
