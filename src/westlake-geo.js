// Compatibility entry point for the guide, itinerary and world viewer.
// Editable geometry lives in the map package, shared with both 3D visual styles.
import {MAP_PACKAGES} from './map3d/data/catalog.js';
const geo=MAP_PACKAGES.westlake.geo;
export const {GEO_FRAME,fromLonLat,toLonLat,WATER,PLACES,CAUSEWAYS,BRIDGE,BRIDGES,distToPolyline,pointOnPolyline,landField,terrainHeight,groundHeight,hillHeight,cityAmount,isWater,inBounds,walkable,NODES,EDGES,SPOT_GEO,shortestPath,nearestNode,bearing,compassName,routeTime,neighboursOf}=geo;
export default geo;
