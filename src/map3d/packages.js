import miniature from './styles/miniature.json' with {type:'json'};
import papercraft from './styles/papercraft.json' with {type:'json'};
export {MAP_PACKAGES,mapPackageFor} from './data/catalog.js';
export const STYLES={miniature,papercraft};
export function styleFor(pkg,id){return STYLES[pkg.manifest.styles.includes(id)?id:pkg.manifest.defaultStyle];}
