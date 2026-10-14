// The guide, itinerary and renderer all use the same registered map packages (bundled or registered at runtime).
import {MAP_PACKAGES} from './map3d/data/catalog.js';
export const geoFor=id=>MAP_PACKAGES[id]?.geo||null;
