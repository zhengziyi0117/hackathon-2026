// West Lake layout for the miniature map. One unit = 100 m; +x east, +z south.
// Shoreline, islands, ponds, causeways and landmark positions come from OpenStreetMap (see westlake-osm.js);
// causeways are widened and hills are invented for readability, so distances are approximate.
import OSM from './westlake-osm.js';
export const GEO_FRAME=Object.freeze({origin:OSM.origin,unitMeters:100,bounds:OSM.bounds,source:OSM.source});
export const fromLonLat=([lon,lat])=>[(lon-OSM.origin[0])*962,-(lat-OSM.origin[1])*1110];
export const toLonLat=([x,z])=>[OSM.origin[0]+x/962,OSM.origin[1]-z/1110];
export const WATER=OSM.water;
const at=name=>OSM.poi[name][0].slice(0,2);
// Named places used by the scene (OSM positions; a few are nudged onto land).
export const PLACES={
 duanqiao:at('断桥'),jindai:at('锦带桥'),pinghu:at('平湖秋月'),gushan:at('孤山'),xiling:at('西泠桥'),
 quyuan:at('曲院风荷'),yudai:at('玉带桥'),huxin:at('湖心亭'),ruangong:at('阮公墩'),santan:at('三潭印月'),
 xiaoyingzhou:OSM.poi['三潭印月'][1].slice(0,2),huagang:at('花港观鱼'),leifeng:at('雷峰塔'),xizhao:at('夕照山'),
 baochu:at('保俶塔'),baoshi:at('宝石山'),nanping:at('南屏山'),
};

export function distToPolyline(px,pz,pts){
 let best=Infinity,total=0,bestAt=0;
 for(let i=1;i<pts.length;i++){
  const [ax,az]=pts[i-1],[bx,bz]=pts[i],ex=bx-ax,ez=bz-az,len=Math.hypot(ex,ez);
  const t=Math.max(0,Math.min(1,((px-ax)*ex+(pz-az)*ez)/(len*len))),d=Math.hypot(px-ax-ex*t,pz-az-ez*t);
  if(d<best){best=d;bestAt=total+len*t;}total+=len;
 }
 return {d:best,along:bestAt/total,length:total};
}
export const pointOnPolyline=(pts,t)=>{
 const lens=[];let total=0;for(let i=1;i<pts.length;i++){const l=Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]);lens.push(l);total+=l;}
 let k=t*total;for(let i=0;i<lens.length;i++){if(k<=lens[i]||i===lens.length-1){const f=Math.min(1,k/lens[i]);return [pts[i][0]+(pts[i+1][0]-pts[i][0])*f,pts[i][1]+(pts[i+1][1]-pts[i][1])*f,Math.atan2(pts[i+1][0]-pts[i][0],pts[i+1][1]-pts[i][1])];}k-=lens[i];}
};
// Causeways with their bridges (t = position along the line). Water runs under every bridge.
const onLine=(pts,names)=>names.map(n=>({name:n,t:distToPolyline(...at(n),pts).along}));
const SU=OSM.su,BAI=OSM.bai;
export const CAUSEWAYS=[
 {id:'su',name:'苏堤',width:.36,points:SU,bridges:onLine(SU,['跨虹桥','东浦桥','压堤桥','望山桥','锁澜桥','映波桥'])},
 {id:'bai',name:'白堤',width:.32,points:BAI,bridges:onLine(BAI,['锦带桥','断桥'])},
 // Short links: Xiling bridge (Gushan to the north-west shore), Jinsha dike with the Jade Belt bridge (Su causeway to Quyuan),
 // and the zigzag bridge across Xiaoyingzhou's inner lake. Shapes follow OSM where it has them.
 {id:'xiling',name:'西泠桥',width:.24,minor:true,points:[[-7.73,-8.73],[-8.35,-8.87],[-8.68,-9.22],[-9.3,-9.6]],bridges:[{name:'西泠桥',t:.5}]},
 {id:'jinsha',name:'金沙堤',width:.24,minor:true,points:[[-10.5,-5.05],[-11.18,-4.85],[-11.52,-4.75],[-12.4,-5.2],[-13.1,-5.9]],bridges:[{name:'玉带桥',t:.38}]},
 {id:'shengtang',name:'圣塘桥',width:.2,minor:true,points:[[9.35,-16.85],[9.35,-17.95]],bridges:[{name:'圣塘桥',t:.5}]},
 {id:'jiuqu',name:'九曲桥',width:.18,minor:true,points:[[-2.26,3.7],[-2.2,5.3],[-2.24,6.55]],bridges:[]},
];
export const BRIDGE={length:.8,height:.14,gap:.26};
for(const c of CAUSEWAYS){c.length=distToPolyline(...c.points[0],c.points).length;for(const b of c.bridges){const [x,z,a]=pointOnPolyline(c.points,b.t);Object.assign(b,{x,z,angle:a,big:b.name==='断桥'});}}
export const BRIDGES=CAUSEWAYS.flatMap(c=>c.bridges.map(b=>({...b,causeway:c.id,width:c.width})));

// Signed distance to the shoreline on a 10 m grid: > 0 on land, < 0 on water. Built lazily on first use.
const CELL=.1,B=OSM.bounds,NX=Math.round((B.maxX-B.minX)/CELL),NZ=Math.round((B.maxZ-B.minZ)/CELL);
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
export function landField(x,z){
 let d=shoreDistance(x,z)+(Math.sin(x*3.1+z*1.7)*.5+Math.sin(z*4.3-x*2.2)*.5)*.03;
 for(const c of CAUSEWAYS){const q=distToPolyline(x,z,c.points);if(q.d<c.width)d=Math.max(d,c.width/2-q.d);}
 const br=bridgeAt(x,z);if(br?.inGap)d=Math.min(d,-.08);
 return d;
}

// Terrain height in map units (vertically exaggerated). Water surface is y = 0. Hills are placed by hand near OSM peaks.
const bump=(x,z,cx,cz,r,h)=>h*Math.exp(-((x-cx)**2+(z-cz)**2)/(r*r));
function noise(x,z){return Math.sin(x*.9+Math.sin(z*.7)*1.3)*.5+Math.sin(z*1.3+x*.4)*.35+Math.sin((x+z)*2.1)*.15;}
const P=PLACES;
export const cityAmount=(x,z)=>Math.max(Math.max(0,Math.min(1,(x-14.6)/1.6)),Math.max(0,Math.min(1,(x-5.5)/1.5))*Math.max(0,Math.min(1,(-z-18)/1.2)));
export function hillHeight(x,z){
 let h=0;
 h+=1.5*(bump(x,z,P.baoshi[0],P.baoshi[1]-.6,2.6,2.3)+bump(x,z,P.baochu[0]+.6,P.baochu[1]-.4,2.2,1.9)+bump(x,z,-5.4,-19.2,2.8,2)+bump(x,z,-9.6,-19.6,3.2,2.3)+bump(x,z,-3,-23,4.2,2.8));
 h+=bump(x,z,P.gushan[0]-.4,P.gushan[1]-.35,1.3,.8);
 h+=bump(x,z,P.xizhao[0]+.5,P.xizhao[1]+.1,1.25,1.05)+1.5*(bump(x,z,P.nanping[0],P.nanping[1]+.6,3.2,2.4)+bump(x,z,-3.5,22.6,4.2,3)+bump(x,z,-10.5,20.8,3.6,2.3)+bump(x,z,7,21.5,3.4,1.8));
 const west=Math.max(0,Math.min(1,(-x-19.5)/3));h+=west*(3.2+noise(x*.6,z*.6)*1.4)+bump(x,z,-17,-15.5,3.4,1.9)+bump(x,z,-15.5,16,3,1.6);
 return h*(1-cityAmount(x,z)*.9);
}
export function terrainHeight(x,z,land=landField(x,z)){
 if(land<0)return -.12-.5*Math.min(1,-land/2.2);
 const shore=.07+.14*Math.min(1,land/1.2);
 return shore+hillHeight(x,z)*Math.min(1,land/1.6)+noise(x*2.3,z*2.3)*.03*Math.min(1,land);
}
// Height a walker stands at: the terrain, or the arched deck of a bridge.
export function groundHeight(x,z){
 const br=bridgeAt(x,z),t=terrainHeight(x,z);
 if(!br)return t;
 return Math.max(t,.08+BRIDGE.height*(br.b.big?1.4:1)*(1-br.u*br.u));
}
export const isWater=(x,z)=>landField(x,z)<0;
export function inBounds(x,z,pad=.6){return x>B.minX+pad&&x<B.maxX-pad&&z>B.minZ+pad&&z<B.maxZ-pad;}
export const walkable=(x,z)=>inBounds(x,z)&&(landField(x,z)>.04||!!bridgeAt(x,z))&&terrainHeight(x,z)<3.8;

// Path network. 'walk' follows shores and causeways; 'boat' edges cross the lake to Xiaoyingzhou.
// Generated by scripts/westlake-paths.mjs: walking routes snapped onto land; w* are intermediate shore points.
export const NODES={ph:[-1.32,-9.76],baiM:[0.83,-12.35],dq:[4.04,-16.63],dqN:[4.56,-17.35],w1:[1.5,-17.9],w2:[4.14,-17.76],w3:[3.73,-17.88],w4:[2.95,-17.81],w5:[-2.5,-16.9],w6:[-6,-14.6],w7:[-8.8,-12.3],yue:[-10.6,-10.4],suN:[-11.48,-8.95],w8:[-3,-8.5],w9:[-5.6,-8.7],gsW:[-7.73,-8.73],w10:[-8.35,-8.87],w11:[-8.68,-9.22],xlW:[-9.3,-9.6],w12:[-11.12,-7.77],su1:[-10.26,-4.52],su2:[-9.72,-2.71],w13:[-9.11,-0.64],su3:[-8.3,2.51],su4:[-7.03,7.48],w14:[-6.27,9.79],su5:[-5.05,12.2],w15:[-4.73,12.75],w16:[-4.01,14.23],suS:[-3.14,16.23],w17:[-11.18,-4.85],w18:[-10.68,-4.88],w19:[-11.52,-4.75],w20:[-12.4,-5.2],qy:[-13.1,-5.9],hg:[-6,13.25],w21:[-5.45,12.79],w22:[0,16.4],lfBase:[2.3,14.9],w23:[5.5,16.2],changq:[8.5,15.6],w24:[12.5,11],w25:[14.6,5],hubin:[15.3,0],w26:[15.2,-6],w27:[12.55,-12.5],w28:[14.73,-7.86],w29:[14.74,-8.79],w30:[14.26,-9.71],w31:[9.4,-16.4],w32:[11.94,-13.65],w33:[11.54,-14.18],w34:[10.98,-14.45],w35:[9.35,-16.85],w36:[9.35,-17.95],w37:[7.2,-18.15],w38:[8.88,-18.26],w39:[8.85,-18.46],w40:[8.43,-18.66],w41:[8.12,-18.58],w42:[5.74,-17.81],lf:[2.2,14],phPier:[-2.17,-8.72],hubinPier:[14.75,-0.4],hgPier:[-4.76,12.58],stPier:[-2.26,3.7],stMid:[-2.2,5.3],st:[-2.24,6.55]};
const EDGE_LIST=[["ph","baiM"],["baiM","dq"],["dq","dqN"],["dqN","w2"],["w2","w3"],["w3","w4"],["w4","w1"],["w1","w5"],["w5","w6"],["w6","w7"],["w7","yue"],["yue","suN"],["ph","w8"],["w8","w9"],["w9","gsW"],["gsW","w10"],["w10","w11"],["w11","xlW"],["xlW","yue"],["suN","w12"],["w12","su1"],["su1","su2"],["su2","w13"],["w13","su3"],["su3","su4"],["su4","w14"],["w14","su5"],["su5","w15"],["w15","w16"],["w16","suS"],["su1","w18"],["w18","w17"],["w17","w19"],["w19","w20"],["w20","qy"],["su5","w21"],["w21","hg"],["suS","w22"],["w22","lfBase"],["lfBase","w23"],["w23","changq"],["changq","w24"],["w24","w25"],["w25","hubin"],["hubin","w26"],["w26","w28"],["w28","w29"],["w29","w30"],["w30","w27"],["w27","w32"],["w32","w33"],["w33","w34"],["w34","w31"],["w31","w35"],["w35","w36"],["w36","w38"],["w38","w39"],["w39","w40"],["w40","w41"],["w41","w37"],["w37","w42"],["w42","dqN"],["lfBase","lf"],["ph","phPier"],["hubin","hubinPier"],["hg","hgPier"],["stPier","stMid"],["stMid","st"],["hgPier","stPier","boat"],["hubinPier","stPier","boat"],["phPier","stPier","boat"]];
export const EDGES=EDGE_LIST.map(([a,b,mode='walk'])=>({a,b,mode,length:Math.hypot(NODES[a][0]-NODES[b][0],NODES[a][1]-NODES[b][1])}));

// Each published spot binds to a node. heading: compass direction the 3D world's start view faces (degrees, 0 = north);
// set by hand from the source photo and shown in the studio for review.
export const SPOT_GEO={
 huagang:{node:'hg',label:P.huagang,scene:'西湖十景 · 花港观鱼',heading:20,season:'spring'},
 duanqiao:{node:'dq',label:P.duanqiao,scene:'西湖十景 · 断桥残雪',season:'winter'},
 pinghu:{node:'ph',label:P.pinghu,scene:'西湖十景 · 平湖秋月',season:'autumn'},
 quyuan:{node:'qy',label:P.quyuan,scene:'西湖十景 · 曲院风荷',season:'summer'},
 santan:{node:'st',label:P.santan,scene:'西湖十景 · 三潭印月',season:'autumn'},
 leifeng:{node:'lf',label:P.leifeng,scene:'西湖十景 · 雷峰夕照',season:'dusk'},
};

export function shortestPath(from,to){
 const dist={[from]:0},prev={},open=new Set(Object.keys(NODES));
 while(open.size){
  let u=null;for(const n of open)if(dist[n]!==undefined&&(u===null||dist[n]<dist[u]))u=n;
  if(u===null||u===to)break;open.delete(u);
  for(const e of EDGES){
   const v=e.a===u?e.b:e.b===u?e.a:null;if(!v||!open.has(v))continue;
   const alt=dist[u]+e.length*(e.mode==='boat'?.8:1);
   if(dist[v]===undefined||alt<dist[v]){dist[v]=alt;prev[v]=u;}
  }
 }
 if(dist[to]===undefined)return null;
 const path=[to];while(path[0]!==from)path.unshift(prev[path[0]]);
 const legs=path.slice(1).map((b,i)=>EDGES.find(e=>(e.a===path[i]&&e.b===b)||(e.b===path[i]&&e.a===b)));
 return {nodes:path,legs,meters:legs.reduce((s,e)=>s+e.length,0)*GEO_FRAME.unitMeters,boat:legs.some(e=>e.mode==='boat')};
}
export const nearestNode=(x,z,filter=()=>true)=>Object.entries(NODES).filter(([id])=>filter(id)).reduce((best,[id,[nx,nz]])=>{const d=Math.hypot(nx-x,nz-z);return d<best.d?{id,d}:best;},{id:null,d:Infinity});
// Compass bearing from a to b, degrees clockwise from north.
export const bearing=(a,b)=>(Math.atan2(b[0]-a[0],-(b[1]-a[1]))*180/Math.PI+360)%360;
const COMPASS=['北','东北','东','东南','南','西南','西','西北'];
export const compassName=deg=>COMPASS[Math.round(deg/45)%8];

// Walking at 75 m and boating at 150 m a minute; boarding time is not included.
export function routeTime(route){
 let walk=0,boat=0;for(const e of route.legs)(e.mode==='boat'?(boat+=e.length):(walk+=e.length));
 walk*=GEO_FRAME.unitMeters;boat*=GEO_FRAME.unitMeters;
 return {walk,boat,minutes:Math.max(1,Math.round(walk/75+boat/150))};
}
// Neighbours of a spot among the given ids: route length, travel mode and compass direction.
export function neighboursOf(id,ids,limit=3){
 const g=SPOT_GEO[id];if(!g)return [];
 return ids.filter(o=>o!==id&&SPOT_GEO[o]).map(o=>{
  const route=shortestPath(g.node,SPOT_GEO[o].node);
  return route&&{id:o,meters:Math.round(route.meters/10)*10,boat:route.boat,minutes:Math.max(3,routeTime(route).minutes),bearing:Math.round(bearing(NODES[g.node],NODES[SPOT_GEO[o].node]))};
 }).filter(Boolean).sort((a,b)=>a.meters-b.meters).slice(0,limit);
}
