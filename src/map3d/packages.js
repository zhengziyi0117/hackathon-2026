import miniature from './styles/miniature.json' with {type:'json'};
import papercraft from './styles/papercraft.json' with {type:'json'};
import voxel from './styles/voxel.json' with {type:'json'};
import bricks from './styles/bricks.json' with {type:'json'};
import adventure from './styles/adventure.json' with {type:'json'};
export {MAP_PACKAGES,mapPackageFor} from './data/catalog.js';
import imperial from './styles/imperial.json' with {type:'json'};
import imperialBricks from './styles/imperial-bricks.json' with {type:'json'};
export const STYLES={miniature,papercraft,voxel,bricks,adventure,imperial,'imperial-bricks':imperialBricks};
export function styleFor(pkg,id){return STYLES[pkg.manifest.styles.includes(id)?id:pkg.manifest.defaultStyle];}
