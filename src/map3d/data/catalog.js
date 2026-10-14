import manifest from './westlake/manifest.json' with {type:'json'};
import geography from './westlake/geography.json' with {type:'json'};
import layout from './westlake/layout.json' with {type:'json'};
import interaction from './westlake/interaction.json' with {type:'json'};
import {createGeography} from '../geography.js';
// Register a reviewed package here; all consumers share the same geometry instance.
const sources=[{manifest,geography,layout,interaction}];
export const MAP_PACKAGES=Object.fromEntries(sources.map(p=>[p.manifest.id,{...p,geo:createGeography(p.geography,p.interaction)}]));
export const mapPackageFor=id=>MAP_PACKAGES[id]||null;
