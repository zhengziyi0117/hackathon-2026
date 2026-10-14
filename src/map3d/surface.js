// Display height is separate from the geographic route graph. Every placed
// object and the walker use this same sampler, including after a style change.
export function createSurface(geo,style){
 const p=style.landform;
 if(!p)return {terrainHeight:geo.terrainHeight,groundHeight:geo.groundHeight,baseHeight:geo.terrainHeight,tiles:[]};
 const B=geo.GEO_FRAME.bounds,nx=Math.ceil((B.maxX-B.minX)/p.cell),nz=Math.ceil((B.maxZ-B.minZ)/p.cell);
 const dx=(B.maxX-B.minX)/nx,dz=(B.maxZ-B.minZ)/nz,grid=new Float32Array(nx*nz),tiles=[];grid.fill(NaN);
 const index=(x,z)=>[Math.max(0,Math.min(nx-1,Math.floor((x-B.minX)/dx))),Math.max(0,Math.min(nz-1,Math.floor((z-B.minZ)/dz)))];
 for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){
  const x=B.minX+(i+.5)*dx,z=B.minZ+(j+.5)*dz,h=geo.terrainHeight(x,z);
  // Preserve narrow causeways, bridge decks and the shore's exact footprint.
  if(h<p.minHeight||geo.landField(x,z)<.6)continue;
  grid[j*nx+i]=Math.max(p.minHeight,Math.round(h/p.step)*p.step);
  tiles.push({i,j,x,z,y:grid[j*nx+i],dx,dz});
 }
 const tileHeight=(x,z)=>{const [i,j]=index(x,z);return grid[j*nx+i];};
 const terrainHeight=(x,z)=>{const h=tileHeight(x,z);return Number.isNaN(h)?geo.terrainHeight(x,z):h;};
 const groundHeight=(x,z)=>{
  const natural=geo.terrainHeight(x,z),ground=geo.groundHeight(x,z);
  return ground>natural+.00001?Math.max(ground,terrainHeight(x,z)):terrainHeight(x,z);
 };
 const baseHeight=(x,z)=>Number.isNaN(tileHeight(x,z))?geo.terrainHeight(x,z):Math.min(p.minHeight-.08,geo.terrainHeight(x,z));
 // Walls only at an exposed step. No hidden cube faces or mesh per tile.
 for(const t of tiles)t.neighbours=[[-1,0],[1,0],[0,-1],[0,1]].map(([di,dj])=>{
  const i=t.i+di,j=t.j+dj;if(i<0||i>=nx||j<0||j>=nz)return .06;
  const h=grid[j*nx+i];return Number.isNaN(h)?.08:h;
 });
 return {terrainHeight,groundHeight,baseHeight,tiles};
}
