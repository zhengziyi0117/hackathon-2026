// Compiles a versioned map package into terrain and routing functions. No scenic-specific coordinates.
export function createGeography(data,rules){
const GEO_FRAME=data.frame,WATER=data.water,PLACES=data.places;
const {origin,projection}=GEO_FRAME;
const fromLonLat=([lon,lat])=>[(lon-origin[0])*projection.lonUnits,-(lat-origin[1])*projection.latUnits];
const toLonLat=([x,z])=>[origin[0]+x/projection.lonUnits,origin[1]-z/projection.latUnits];
function distToPolyline(px,pz,pts){
 let best=Infinity,total=0,bestAt=0;
 for(let i=1;i<pts.length;i++){
  const [ax,az]=pts[i-1],[bx,bz]=pts[i],ex=bx-ax,ez=bz-az,len=Math.hypot(ex,ez);
  const t=Math.max(0,Math.min(1,((px-ax)*ex+(pz-az)*ez)/(len*len))),d=Math.hypot(px-ax-ex*t,pz-az-ez*t);
  if(d<best){best=d;bestAt=total+len*t;}total+=len;
 }
 return {d:best,along:bestAt/total,length:total};
}
const pointOnPolyline=(pts,t)=>{
 const lens=[];let total=0;for(let i=1;i<pts.length;i++){const l=Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]);lens.push(l);total+=l;}
 let k=t*total;for(let i=0;i<lens.length;i++){if(k<=lens[i]||i===lens.length-1){const f=Math.min(1,k/lens[i]);return [pts[i][0]+(pts[i+1][0]-pts[i][0])*f,pts[i][1]+(pts[i+1][1]-pts[i][1])*f,Math.atan2(pts[i+1][0]-pts[i][0],pts[i+1][1]-pts[i][1])];}k-=lens[i];}
};
const CAUSEWAYS=structuredClone(data.causeways);
const BRIDGE=data.bridge;
for(const c of CAUSEWAYS){c.length=distToPolyline(...c.points[0],c.points).length;for(const b of c.bridges){const [x,z,a]=pointOnPolyline(c.points,b.t);Object.assign(b,{x,z,angle:a,big:!!b.big});}}
const BRIDGES=CAUSEWAYS.flatMap(c=>c.bridges.map(b=>({...b,causeway:c.id,width:c.width})));

// Signed distance to the shoreline on a 10 m grid: > 0 on land, < 0 on water. Built lazily on first use.
const CELL=data.terrain.cell,B=data.frame.bounds,NX=Math.round((B.maxX-B.minX)/CELL),NZ=Math.round((B.maxZ-B.minZ)/CELL);
let SDF=null;
function edt1(f,n,out,v,zk){
 let k=0;v[0]=0;zk[0]=-1e20;zk[1]=1e20;
 for(let q=1;q<n;q++){let s=((f[q]+q*q)-(f[v[k]]+v[k]*v[k]))/(2*q-2*v[k]);while(s<=zk[k]){k--;s=((f[q]+q*q)-(f[v[k]]+v[k]*v[k]))/(2*q-2*v[k]);}k++;v[k]=q;zk[k]=s;zk[k+1]=1e20;}
 k=0;for(let q=0;q<n;q++){while(zk[k+1]<q)k++;out[q]=(q-v[k])**2+f[v[k]];}
}
// Squared distance (in cells) from every cell to the nearest cell where mask is set (Felzenszwalb & Huttenlocher).
function edt(mask){
 const d=new Float64Array(NX*NZ),m=Math.max(NX,NZ),f=new Float64Array(m),o=new Float64Array(m),v=new Int32Array(m),zk=new Float64Array(m+1);
 for(let i=0;i<d.length;i++)d[i]=mask[i]?0:1e20;
 for(let i=0;i<NX;i++){for(let j=0;j<NZ;j++)f[j]=d[j*NX+i];edt1(f,NZ,o,v,zk);for(let j=0;j<NZ;j++)d[j*NX+i]=o[j];}
 for(let j=0;j<NZ;j++){for(let i=0;i<NX;i++)f[i]=d[j*NX+i];edt1(f,NX,o,v,zk);for(let i=0;i<NX;i++)d[j*NX+i]=o[i];}
 return d;
}
function buildSDF(){
 const water=new Uint8Array(NX*NZ);
 for(let j=0;j<NZ;j++){
  const z=B.minZ+(j+.5)*CELL,xs=[];
  for(const r of WATER)for(let i=0,k=r.length-1;i<r.length;k=i++){const [ax,az]=r[k],[bx,bz]=r[i];if((az>z)!==(bz>z))xs.push(ax+(z-az)/(bz-az)*(bx-ax));}
  xs.sort((a,b)=>a-b);
  for(let q=0;q+1<xs.length;q+=2){const i0=Math.max(0,Math.ceil((xs[q]-B.minX)/CELL-.5)),i1=Math.min(NX-1,Math.floor((xs[q+1]-B.minX)/CELL-.5));for(let i=i0;i<=i1;i++)water[j*NX+i]=1;}
 }
 const land=water.map(w=>1-w),toWater=edt(water),toLand=edt(land),out=new Float32Array(NX*NZ);
 for(let i=0;i<out.length;i++)out[i]=water[i]?-(Math.sqrt(toLand[i])-.5)*CELL:(Math.sqrt(toWater[i])-.5)*CELL;
 return out;
}
function shoreDistance(x,z){
 SDF||=buildSDF();
 const fx=Math.max(0,Math.min(NX-1.001,(x-B.minX)/CELL-.5)),fz=Math.max(0,Math.min(NZ-1.001,(z-B.minZ)/CELL-.5)),i=fx|0,j=fz|0,u=fx-i,v=fz-j,k=j*NX+i;
 return (SDF[k]*(1-u)+SDF[k+1]*u)*(1-v)+(SDF[k+NX]*(1-u)+SDF[k+NX+1]*u)*v;
}
function bridgeAt(x,z){
 for(const b of BRIDGES){const dx=x-b.x,dz=z-b.z,s=Math.sin(b.angle),c=Math.cos(b.angle),along=dx*s+dz*c,across=dx*c-dz*s,L=BRIDGE.length*(b.big?1.4:1)/2;
  if(Math.abs(along)<L&&Math.abs(across)<b.width/2+.03)return {b,u:along/L,inGap:Math.abs(along)<BRIDGE.gap*(b.big?1.4:1)};}
 return null;
}
// > 0 on land (shore, islands, causeways), < 0 on water; water passes under bridges.
function landField(x,z){
 let d=shoreDistance(x,z)+(Math.sin(x*3.1+z*1.7)*.5+Math.sin(z*4.3-x*2.2)*.5)*.03;
 for(const c of CAUSEWAYS){const q=distToPolyline(x,z,c.points);if(q.d<c.width)d=Math.max(d,c.width/2-q.d);}
 const br=bridgeAt(x,z);if(br?.inGap)d=Math.min(d,-.08);
 return d;
}

// Terrain height in map units (vertically exaggerated). Water surface is y = 0. Hills are placed by hand near OSM peaks.
const bump=(x,z,cx,cz,r,h)=>h*Math.exp(-((x-cx)**2+(z-cz)**2)/(r*r));
function noise(x,z){return Math.sin(x*.9+Math.sin(z*.7)*1.3)*.5+Math.sin(z*1.3+x*.4)*.35+Math.sin((x+z)*2.1)*.15;}
const city=data.terrain.city;
const cityAmount=(x,z)=>Math.max(Math.max(0,Math.min(1,(x-city.eastX)/city.eastWidth)),Math.max(0,Math.min(1,(x-city.northX)/city.northWidth))*Math.max(0,Math.min(1,(city.northZ-z)/city.northDepth)));
function hillHeight(x,z){
 let h=data.terrain.hills.reduce((v,b)=>v+bump(x,z,...b.at,b.radius,b.height),0);
 const r=data.terrain.westRidge,west=Math.max(0,Math.min(1,(r.startX-x)/r.width));
 h+=west*(r.height+noise(x*.6,z*.6)*r.noise);
 return h*(1-cityAmount(x,z)*.9);
}
function terrainHeight(x,z,land=landField(x,z)){
 if(land<0)return -.12-.5*Math.min(1,-land/2.2);
 const shore=.07+.14*Math.min(1,land/1.2);
 return shore+hillHeight(x,z)*Math.min(1,land/1.6)+noise(x*2.3,z*2.3)*.03*Math.min(1,land);
}
// Height a walker stands at: the terrain, or the arched deck of a bridge.
function groundHeight(x,z){
 const br=bridgeAt(x,z),t=terrainHeight(x,z);
 if(!br)return t;
 return Math.max(t,.08+BRIDGE.height*(br.b.big?1.4:1)*(1-br.u*br.u));
}
const isWater=(x,z)=>landField(x,z)<0;
function inBounds(x,z,pad=rules.movement.boundsPadding){return x>B.minX+pad&&x<B.maxX-pad&&z>B.minZ+pad&&z<B.maxZ-pad;}
const walkable=(x,z)=>inBounds(x,z)&&(landField(x,z)>rules.movement.minLand||!!bridgeAt(x,z))&&terrainHeight(x,z)<rules.movement.maxTerrainHeight;

const NODES=data.network.nodes;
const EDGES=data.network.edges.map(({a,b,mode})=>({a,b,mode,length:Math.hypot(NODES[a][0]-NODES[b][0],NODES[a][1]-NODES[b][1])}));
const SPOT_GEO=data.spots;

function shortestPath(from,to){
 const dist={[from]:0},prev={},open=new Set(Object.keys(NODES));
 while(open.size){
  let u=null;for(const n of open)if(dist[n]!==undefined&&(u===null||dist[n]<dist[u]))u=n;
  if(u===null||u===to)break;open.delete(u);
  for(const e of EDGES){
   const v=e.a===u?e.b:e.b===u?e.a:null;if(!v||!open.has(v))continue;
   const alt=dist[u]+e.length*(e.mode==='boat'?rules.routing.boatCostMultiplier:1);
   if(dist[v]===undefined||alt<dist[v]){dist[v]=alt;prev[v]=u;}
  }
 }
 if(dist[to]===undefined)return null;
 const path=[to];while(path[0]!==from)path.unshift(prev[path[0]]);
 const legs=path.slice(1).map((b,i)=>EDGES.find(e=>(e.a===path[i]&&e.b===b)||(e.b===path[i]&&e.a===b)));
 return {nodes:path,legs,meters:legs.reduce((s,e)=>s+e.length,0)*GEO_FRAME.unitMeters,boat:legs.some(e=>e.mode==='boat')};
}
const nearestNode=(x,z,filter=()=>true)=>Object.entries(NODES).filter(([id])=>filter(id)).reduce((best,[id,[nx,nz]])=>{const d=Math.hypot(nx-x,nz-z);return d<best.d?{id,d}:best;},{id:null,d:Infinity});
// Compass bearing from a to b, degrees clockwise from north.
const bearing=(a,b)=>(Math.atan2(b[0]-a[0],-(b[1]-a[1]))*180/Math.PI+360)%360;
const COMPASS=['北','东北','东','东南','南','西南','西','西北'];
const compassName=deg=>COMPASS[Math.round(deg/45)%8];

// Walking at 75 m and boating at 150 m a minute; boarding time is not included.
function routeTime(route){
 let walk=0,boat=0;for(const e of route.legs)(e.mode==='boat'?(boat+=e.length):(walk+=e.length));
 walk*=GEO_FRAME.unitMeters;boat*=GEO_FRAME.unitMeters;
 return {walk,boat,minutes:Math.max(1,Math.round(walk/rules.routing.walkMetersPerMinute+boat/rules.routing.boatMetersPerMinute))};
}
// Neighbours of a spot among the given ids: route length, travel mode and compass direction.
function neighboursOf(id,ids,limit=3){
 const g=SPOT_GEO[id];if(!g)return [];
 return ids.filter(o=>o!==id&&SPOT_GEO[o]).map(o=>{
  const route=shortestPath(g.node,SPOT_GEO[o].node);
  return route&&{id:o,meters:Math.round(route.meters/10)*10,boat:route.boat,minutes:Math.max(3,routeTime(route).minutes),bearing:Math.round(bearing(NODES[g.node],NODES[SPOT_GEO[o].node]))};
 }).filter(Boolean).sort((a,b)=>a.meters-b.meters).slice(0,limit);
}

return {GEO_FRAME,fromLonLat,toLonLat,WATER,PLACES,CAUSEWAYS,BRIDGE,BRIDGES,distToPolyline,pointOnPolyline,landField,terrainHeight,groundHeight,hillHeight,cityAmount,isWater,inBounds,walkable,NODES,EDGES,SPOT_GEO,shortestPath,nearestNode,bearing,compassName,routeTime,neighboursOf};
}
