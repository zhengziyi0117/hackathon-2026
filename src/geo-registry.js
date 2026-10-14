// The guide, itinerary and renderer all use the same registered map packages.
import {MAP_PACKAGES} from './map3d/data/catalog.js';
export const GEO=Object.fromEntries(Object.entries(MAP_PACKAGES).map(([id,p])=>[id,p.geo]));
export const geoFor=id=>GEO[id]||null;
