import manifest from './westlake/manifest.json' with {type:'json'};
import geography from './westlake/geography.json' with {type:'json'};
import layout from './westlake/layout.json' with {type:'json'};
import interaction from './westlake/interaction.json' with {type:'json'};
import {createGeography} from '../geography.js';
import palaceManifest from './forbidden-city/manifest.json' with {type:'json'};
import palaceGeography from './forbidden-city/geography.json' with {type:'json'};
import palaceLayout from './forbidden-city/layout.json' with {type:'json'};
import palaceInteraction from './forbidden-city/interaction.json' with {type:'json'};
// Register a reviewed package here; all consumers share the same geometry instance.
export const sources=[{manifest,geography,layout,interaction},{manifest:palaceManifest,geography:palaceGeography,layout:palaceLayout,interaction:palaceInteraction}];
export const MAP_PACKAGES=Object.fromEntries(sources.map(p=>[p.manifest.id,{...p,geo:createGeography(p.geography,p.interaction)}]));
export const mapPackageFor=id=>MAP_PACKAGES[id]||null;
