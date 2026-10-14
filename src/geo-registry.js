// Scenic areas that have a 3D miniature map, keyed by scenic id. A scenic without an entry only gets the 2D map.
import * as westlake from './westlake-geo.js';
export const GEO={westlake};
export const geoFor=id=>GEO[id]||null;
