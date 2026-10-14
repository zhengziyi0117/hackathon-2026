import * as T from 'three';
import {createModelKit} from './models.js';
import {createSurface} from './surface.js';
import {createTerraces} from './terraces.js';
import {disposeTree} from './dispose.js';

// The renderer consumes geography, placement and style independently.
export function createWorld(parent,{geo,layout,style}){
const {GEO_FRAME,CAUSEWAYS,BRIDGES,BRIDGE,PLACES,NODES,EDGES,SPOT_GEO,landField,hillHeight,cityAmount,distToPolyline,pointOnPolyline}=geo;
const surface=createSurface(geo,style),{terrainHeight,groundHeight}=surface;
const {SHAPE,U,MAT,GLOW,weatherize,glowMat,boat,TREE_GEO,landmark,traveler}=createModelKit(style);
const MOODS=style.moods,scene=new T.Group();parent.add(scene);
const B=GEO_FRAME.bounds,W=B.maxX-B.minX,D=B.maxZ-B.minZ,CX=(B.minX+B.maxX)/2,CZ=(B.minZ+B.maxZ)/2;
const rng=(seed=7)=>()=>{seed=(seed*16807)%2147483647;return (seed-1)/2147483646;};
const C=c=>new T.Color(c);

function landTexture(res=layout.quality.landTextureResolution){
 const data=new Uint8Array(res*res);
 for(let j=0;j<res;j++)for(let i=0;i<res;i++){const x=B.minX+(i+.5)/res*W,z=B.minZ+(j+.5)/res*D;data[j*res+i]=Math.round((Math.max(-3,Math.min(1,landField(x,z)))+3)/4*255);}
 const tex=new T.DataTexture(data,res,res,T.RedFormat,T.UnsignedByteType);tex.magFilter=tex.minFilter=T.LinearFilter;tex.needsUpdate=true;return tex;
}
function terrain(){
 const seg=layout.quality.terrainSegments,g=new T.PlaneGeometry(W,D,seg,seg);g.rotateX(-Math.PI/2);g.translate(CX,0,CZ);
 const p=g.attributes.position,col=[],grass=[],land=new Float32Array(p.count);
 for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i),l=landField(x,z);land[i]=l;p.setY(i,surface.baseHeight(x,z,l));}
 g.computeVertexNormals();const n=g.attributes.normal;
 const {sand,lawn,meadow,forest,rock,bed,bedDeep,city}=Object.fromEntries(Object.entries(style.terrain).map(([k,v])=>[k,C(v)])),tmp=new T.Color();
 for(let i=0;i<p.count;i++){
  const x=p.getX(i),z=p.getZ(i),l=land[i],y=p.getY(i),slope=1-n.getY(i);let gr=0;
  if(l<0)tmp.copy(bed).lerp(bedDeep,Math.min(1,-l/2));
  else{
   const h=hillHeight(x,z);tmp.copy(meadow).lerp(lawn,.5+.5*Math.sin(x*.8+z*.6));tmp.lerp(forest,Math.min(1,h/1.4));
   tmp.lerp(sand,1-Math.min(1,l/.22));tmp.lerp(rock,Math.min(1,Math.max(0,slope-.18)*4));
   tmp.lerp(city,cityAmount(x,z)*.8);
   gr=Math.min(1,l/.22)*(1-Math.min(1,Math.max(0,slope-.18)*4));
  }
  col.push(tmp.r,tmp.g,tmp.b);grass.push(gr);
 }
 g.setAttribute('color',new T.Float32BufferAttribute(col,3));g.setAttribute('aGrass',new T.Float32BufferAttribute(grass,1));
 const m=new T.Mesh(g,weatherize(new T.MeshStandardMaterial({vertexColors:true,roughness:.95,flatShading:style.surface.flatTerrain}),{tint:true,key:'terrain'}));m.receiveShadow=true;m.name='terrain';
 return surface.tiles.length?new T.Group().add(m,createTerraces(surface,geo,style,weatherize)):m;
}
// Strata skirt around the diorama slab.
function skirt(){
 const ring=[],steps=120;
 for(let s=0;s<4;s++)for(let i=0;i<steps;i++){const t=i/steps;ring.push(s===0?[B.minX+t*W,B.minZ]:s===1?[B.maxX,B.minZ+t*D]:s===2?[B.maxX-t*W,B.maxZ]:[B.minX,B.maxZ-t*D]);}
 const bands=style.strata,rows=bands.length,pos=[],col=[],idx=[],bottom=-3.4;
 ring.forEach(([x,z])=>{const top=Math.max(.06,terrainHeight(x,z));for(const [f,c] of bands){pos.push(x,top+(bottom-top)*f,z);const k=C(c);col.push(k.r,k.g,k.b);}});
 for(let i=0;i<ring.length;i++){const a=i*rows,b=((i+1)%ring.length)*rows;for(let r=0;r<rows-1;r++)idx.push(a+r,a+r+1,b+r,b+r,a+r+1,b+r+1);}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('color',new T.Float32BufferAttribute(col,3));g.setIndex(idx);g.computeVertexNormals();
 const m=new T.Mesh(g,new T.MeshStandardMaterial({vertexColors:true,roughness:1,side:T.DoubleSide}));
 const base=new T.Mesh(new T.BoxGeometry(W,.01,D),new T.MeshStandardMaterial({color:style.base}));base.position.set(CX,bottom,CZ);
 return new T.Group().add(m,base);
}
function water(landTex){
 const g=new T.PlaneGeometry(W,D,1,1);g.rotateX(-Math.PI/2);g.translate(CX,0,CZ);
 const mat=new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{uTime:U.uTime,uLand:{value:landTex},uMin:{value:new T.Vector2(B.minX,B.minZ)},uSize:{value:new T.Vector2(W,D)},
  uShallow:{value:C('#79c3bd')},uDeep:{value:C('#2f7f8e')},uSky:{value:C('#f6e7d8')},uSunDir:{value:new T.Vector3(-.5,.75,.42).normalize()},uSunCol:{value:C('#fff1dc')},uNight:U.uNight,uSnow:U.uSnow},
  vertexShader:`varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
  fragmentShader:`uniform float uTime,uNight,uSnow;uniform sampler2D uLand;uniform vec2 uMin,uSize;uniform vec3 uShallow,uDeep,uSky,uSunDir,uSunCol;varying vec3 vW;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float waves(vec2 p){return noise(p*1.6+uTime*vec2(.25,.18))*.6+noise(p*3.7-uTime*vec2(.2,.32))*.3+noise(p*8.-uTime*.5)*.1;}
void main(){
 float land=texture2D(uLand,(vW.xz-uMin)/uSize).r*4.-3.;if(land>.015)discard;
 float depth=clamp(-land/2.4,0.,1.);vec3 col=mix(uShallow,uDeep,smoothstep(0.,1.,depth));
 vec2 e=vec2(.06,0.);float h0=waves(vW.xz),hx=waves(vW.xz+e.xy),hz=waves(vW.xz+e.yx);
 vec3 N=normalize(vec3((h0-hx)*mix(3.,1.6,uNight)*${style.water.waves.toFixed(3)},1.,(h0-hz)*mix(3.,1.6,uNight)*${style.water.waves.toFixed(3)}));vec3 V=normalize(cameraPosition-vW);
 float fres=pow(1.-max(dot(N,V),0.),4.);col=mix(col,uSky,fres*.55+.08);
 vec3 H=normalize(normalize(uSunDir)+V);float spec=pow(max(dot(N,H),0.),mix(220.,700.,uNight));col+=uSunCol*spec*mix(1.6,.6,uNight)*${style.water.specular.toFixed(3)};
 float sparkle=step(.99,noise(vW.xz*18.+uTime*.8))*smoothstep(.2,.9,depth)*(1.-uNight)*.35;col+=sparkle*${style.water.specular.toFixed(3)};col+=(hash(floor(vW.xz*180.))-.5)*${style.water.grain.toFixed(3)};
 float shore=1.-smoothstep(0.,.32,-land);float band=.5+.5*sin(-land*34.-uTime*2.2+noise(vW.xz*2.)*5.);
 col=mix(col,mix(vec3(1.),vec3(.55,.66,.9),uNight),shore*(.35+.45*band)*(1.-uSnow*.3)*mix(1.,.45,uNight));
 gl_FragColor=vec4(col,mix(.78,.94,depth));
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`});
 const m=new T.Mesh(g,mat);m.renderOrder=2;m.name='water';return m;
}
// Thin stone-coloured ribbons for the walking network.
function paths(){
 const pos=[],idx=[];let v=0;
 for(const e of EDGES.filter(e=>e.mode==='walk')){
  const [ax,az]=NODES[e.a],[bx,bz]=NODES[e.b],n=Math.max(2,Math.ceil(e.length/.18)),dx=bx-ax,dz=bz-az,len=Math.hypot(dx,dz),px=-dz/len*.055,pz=dx/len*.055;
  for(let i=0;i<=n;i++){const x=ax+dx*i/n,z=az+dz*i/n,y=Math.max(.05,groundHeight(x,z))+.022;pos.push(x+px,y,z+pz,x-px,y,z-pz);if(i<n)idx.push(v,v+1,v+2,v+1,v+3,v+2);v+=2;}
  v=pos.length/3;
 }
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();
 const m=new T.Mesh(g,weatherize(new T.MeshStandardMaterial({color:style.path,roughness:1,polygonOffset:true,polygonOffsetFactor:-2}),{key:'path'}));m.receiveShadow=true;return m;
}
function nearPath(x,z,r){
 for(const e of EDGES){const d=distToPolyline(x,z,[NODES[e.a],NODES[e.b]]).d;if(d<r)return true;}return false;
}
function vegetation(spotPoints){
 const rand=rng(layout.vegetation.seed),out=[],kinds={round:[],conifer:[],willow:[],peach:[]};
 const clear=(x,z)=>spotPoints.some(([sx,sz])=>Math.hypot(sx-x,sz-z)<1.05);
 for(let i=0;i<layout.vegetation.attempts;i++){
  const x=B.minX+.5+rand()*(W-1),z=B.minZ+.5+rand()*(D-1),l=landField(x,z);if(l<.3||(cityAmount(x,z)>.3&&rand()>.07)||clear(x,z)||nearPath(x,z,.3))continue;
  const h=hillHeight(x,z),p=h>.6?.5:l>1.2?.11:.05;if(rand()>p)continue;
  kinds[h>.9&&rand()<.55?'conifer':'round'].push([x,z,.75+rand()*.6,rand(),l<1.6]);
 }
 // Su and Bai causeways: a row of willows and peaches on each side ("one willow, one peach"), none on the bridges.
 for(const c of CAUSEWAYS.filter(c=>!c.minor)){
  const n=Math.round(c.length/.3);
  for(let i=1;i<n;i++){
   const t=i/n;if(c.bridges.some(b=>Math.abs(b.t-t)*c.length<BRIDGE.length*.75))continue;
   const [x,z,a]=pointOnPolyline(c.points,t),nx=Math.cos(a),nz=-Math.sin(a);
   for(const side of [-1,1]){const k=(i+(side>0?1:0))%2;(k?kinds.peach:kinds.willow).push([x+nx*side*c.width*.4,z+nz*side*c.width*.4,.46+rand()*.12,rand(),true]);}
  }
 }
 // Narrow islands (Xiaoyingzhou's ring, Huxinting, Ruangongdun) are too thin for the random pass above.
 for(const [cx,cz,r] of layout.vegetation.islands)for(let i=0;i<500;i++){
  const x=cx+(rand()-.5)*r*2,z=cz+(rand()-.5)*r*2,l=landField(x,z);if(l<.05||nearPath(x,z,.14)||rand()>.32)continue;kinds[rand()<.45?'willow':'round'].push([x,z,.42+rand()*.18,rand(),true]);
 }
 const meshes={},dummy=new T.Object3D(),trunkGeo=TREE_GEO.trunk(),trunks=[];
 const leafMat={round:weatherize(new T.MeshStandardMaterial({roughness:style.surface.roughness??.9,flatShading:style.geometry!=='adventure'&&style.geometry!=='bricks'}),{key:'leaf'}),conifer:weatherize(new T.MeshStandardMaterial({roughness:style.surface.roughness??.9,flatShading:style.geometry!=='adventure'&&style.geometry!=='bricks'}),{key:'leaf'}),
  willow:weatherize(new T.MeshStandardMaterial({roughness:style.surface.roughness??.85}),{sway:SHAPE.playful?0:.05,key:'willow'}),peach:weatherize(new T.MeshStandardMaterial({roughness:style.surface.roughness??.85,flatShading:style.geometry!=='adventure'&&style.geometry!=='bricks'}),{key:'leaf'})};
 for(const [kind,list] of Object.entries(kinds)){
  const m=new T.InstancedMesh(TREE_GEO[kind](),leafMat[kind],list.length);m.castShadow=true;m.receiveShadow=true;
  list.forEach(([x,z,s,r],i)=>{dummy.position.set(x,terrainHeight(x,z)-.02,z);dummy.rotation.set(0,style.geometry==='voxel'?Math.round(r*4)*Math.PI/2:r*6.28,0);dummy.scale.setScalar(s*(kind==='willow'?.9:1));dummy.updateMatrix();m.setMatrixAt(i,dummy.matrix);if(kind!=='conifer')trunks.push(dummy.matrix.clone());});
  m.userData.list=list;meshes[kind]=m;out.push(m);
 }
 const tm=new T.InstancedMesh(trunkGeo,MAT.woodDark,trunks.length);trunks.forEach((mx,i)=>tm.setMatrixAt(i,mx));tm.castShadow=true;out.push(tm);
 return {group:new T.Group().add(...out),meshes};
}
// Seasonal canopy colours. Each instance keeps a random r for variety.
const PALETTE=style.treePalette;
function paintTrees(meshes,m){
 const c=new T.Color(),a=new T.Color(),w=new T.Color(),b=new T.Color();
 for(const [kind,mesh] of Object.entries(meshes)){
  const P=PALETTE[kind];
  mesh.userData.list.forEach(([, , ,r],i)=>{
   const pick=arr=>arr[Math.floor(r*arr.length*7.31)%arr.length];
   c.set(pick(P.green));a.set(pick(P.autumn));w.set(pick(P.winter));
   c.lerp(a,m.autumn*(kind==='conifer'?.4:r<.85?1:.3));c.lerp(w,m.snow*.85);
   if(P.blossom){b.set(pick(P.blossom));c.lerp(b,m.blossom);}
   if(kind==='round'&&m.blossom&&r>.9&&mesh.userData.list[i][4]){b.set(pick(PALETTE.peach.blossom));c.lerp(b,m.blossom*.9);}
   mesh.setColorAt(i,c);
  });
  mesh.instanceColor.needsUpdate=true;
 }
}
// Hubin and the north-east: low white-walled houses by the lake, mid-rise blocks behind, a few towers at the back.
function city(){
 const rand=rng(layout.city.seed),houses=[],blocks=[];
 for(let x=B.minX+.8;x<B.maxX-.6;x+=.9)for(let z=B.minZ+.8;z<B.maxZ-.8;z+=.8){
  const px=x+(rand()-.5)*.35,pz=z+(rand()-.5)*.3,l=landField(px,pz);
  if(cityAmount(px,pz)<.6||l<.55||nearPath(px,pz,.38)||rand()<.3)continue;
  (l<2.6||rand()<.25?houses:blocks).push([px,pz,rand(),l]);
 }
 const d=new T.Object3D(),tint=new T.Color(),out=new T.Group();
 const body=SHAPE.box(.32,.2,.24).translate(0,.1,0),roof=SHAPE.houseRoof()||new T.CylinderGeometry(.19,.19,.36,3,1).rotateZ(Math.PI/2).rotateX(-Math.PI/2).scale(1,.42,1).translate(0,.24,0);
 const hm=new T.InstancedMesh(body,MAT.wall,houses.length),rm=new T.InstancedMesh(roof,MAT.roofCity,houses.length);
 houses.forEach(([x,z,r],i)=>{const s=1.2+r*.6;d.position.set(x,terrainHeight(x,z)-.01,z);d.rotation.set(0,r>.5?.08:Math.PI/2+.08,0);d.scale.set(s,.8+r*.5,s);d.updateMatrix();hm.setMatrixAt(i,d.matrix);rm.setMatrixAt(i,d.matrix);
  hm.setColorAt(i,tint.set(SHAPE.playful?[style.materials.wall,style.materials.stone,'#f2c99b'][Math.floor(r*631)%3]:['#f6f2e9','#efe8da','#f8f5ee'][Math.floor(r*631)%3]));rm.setColorAt(i,tint.set(style.geometry!=='classic'?style.materials.roof:['#5d6670','#6b747d','#545c66'][Math.floor(r*997)%3]));});
 const block=SHAPE.cityBlock(),bm=new T.InstancedMesh(block,MAT.wall,blocks.length);
 blocks.forEach(([x,z,r,l],i)=>{const tall=l>5&&r>.82,h=tall?2.4+r*2.6:.7+r*1.1;d.position.set(x,terrainHeight(x,z)-.01,z);d.rotation.set(0,.08,0);d.scale.set(tall?.8:1+r*.5,h,tall?.8:1);d.updateMatrix();bm.setMatrixAt(i,d.matrix);
  bm.setColorAt(i,tint.set(SHAPE.playful?[style.materials.wall,'#f1d6ae','#bbd2c4','#d6c6ac'][Math.floor(r*419)%4]:tall?['#dfe4e8','#cfd8de','#e8e4dc'][Math.floor(r*313)%3]:['#ece6da','#e4ddd0','#f1ede5','#d9d4ca'][Math.floor(r*419)%4]));});
 for(const m of [hm,rm,bm]){m.castShadow=m.receiveShadow=true;out.add(m);}
 // Lit windows at night: a band per house, a few rows per block.
 const lit=[...houses.map(h=>[...h,0]),...blocks.map(b=>[...b,1])],win=new T.InstancedMesh(new T.BoxGeometry(1,1,1),glowMat('#ffcf7a',0,2.4,'#8d99a3'),lit.length);
 lit.forEach(([x,z,r,l,isBlock],i)=>{const tall=isBlock&&l>5&&r>.82,h=isBlock?(tall?2.4+r*2.6:.7+r*1.1)*.5:.13;d.position.set(x,terrainHeight(x,z)+(isBlock?h*.55:.13),z);d.rotation.set(0,isBlock?.08:r>.5?.08:Math.PI/2+.08,0);
  d.scale.set(isBlock?(tall?.8:1+r*.5)*.51:(1.2+r*.6)*.33,isBlock?h*.38:.05,isBlock?.41*(tall?.8:1):.245*(1.2+r*.6));if(r<.25)d.scale.setScalar(0);d.updateMatrix();win.setMatrixAt(i,d.matrix);});
 out.add(win);return out;
}
function lanterns(){
 const pts=[];
 for(const c of CAUSEWAYS.filter(c=>!c.minor)){const n=Math.round(c.length/.7);for(let i=1;i<n;i++){if(c.bridges.some(b=>Math.abs(b.t-i/n)*c.length<BRIDGE.length*.7))continue;const [x,z,a]=pointOnPolyline(c.points,i/n),s=i%2?1:-1;pts.push([x+Math.cos(a)*c.width*.5*s,z-Math.sin(a)*c.width*.5*s]);}}
 for(const e of EDGES.filter(e=>e.mode==='walk'&&e.length>1.6&&!CAUSEWAYS.some(c=>distToPolyline(...NODES[e.a],c.points).d<.2))){const n=Math.floor(e.length/1.3);for(let i=1;i<n;i++){const [ax,az]=NODES[e.a],[bx,bz]=NODES[e.b];pts.push([ax+(bx-ax)*i/n+.09,az+(bz-az)*i/n]);}}
 const post=new T.InstancedMesh(new T.CylinderGeometry(.01,.012,.16,5).translate(0,.08,0),MAT.woodDark,pts.length),lamp=new T.InstancedMesh(new T.SphereGeometry(.03,8,6),glowMat('#ff9a3c',.05,5,'#c23b22'),pts.length),d=new T.Object3D();
 pts.forEach(([x,z],i)=>{const y=Math.max(.06,groundHeight(x,z));d.position.set(x,y,z);d.updateMatrix();post.setMatrixAt(i,d.matrix);d.position.y=y+.18;d.updateMatrix();lamp.setMatrixAt(i,d.matrix);});
 return new T.Group().add(post,lamp);
}
function lotusField(){
 const rand=rng(layout.lotus.seed),pads=[],flowers=[];
 const [lx,lz]=layout.lotus.at;
 for(let i=0;i<layout.lotus.attempts&&pads.length<layout.lotus.maxPads;i++){const x=lx+(rand()-.5)*5,z=lz+(rand()-.5)*4.4;if(landField(x,z)>-.1||Math.hypot((x-lx)/2.5,(z-lz)/2.2)>1)continue;pads.push([x,z,.6+rand()*.7,rand()]);if(rand()<.24)flowers.push([x+.03,z,rand()]);}
 const pm=new T.InstancedMesh(new T.CylinderGeometry(.09,.09,.012,10),weatherize(new T.MeshStandardMaterial({color:'#5f9a48',roughness:.8}),{key:'lotus'}),pads.length);
 const fm=new T.InstancedMesh(new T.ConeGeometry(.045,.07,6,1,true).rotateX(Math.PI).translate(0,.1,0),new T.MeshStandardMaterial({color:'#f39ab4',emissive:'#f06f97',emissiveIntensity:.25,side:T.DoubleSide}),flowers.length);
 pm.userData.list=pads;fm.userData.list=flowers;
 return {group:new T.Group().add(pm,fm),pads:pm,flowers:fm};
}
function setLotus(l,amount,m){
 const d=new T.Object3D(),c=new T.Color('#5f9a48').lerp(new T.Color('#9a7a46'),Math.max(m.autumn*.6,m.snow*.9));
 l.pads.userData.list.forEach(([x,z,s,r],i)=>{d.position.set(x,.025,z);d.rotation.set(0,r*6,0);d.scale.setScalar(s*Math.max(.05,amount));d.updateMatrix();l.pads.setMatrixAt(i,d.matrix);l.pads.setColorAt(i,c);});
 l.flowers.userData.list.forEach(([x,z],i)=>{d.position.set(x,.02,z);d.rotation.set(0,0,0);d.scale.setScalar(Math.max(0,(amount-.5)*2));d.updateMatrix();l.flowers.setMatrixAt(i,d.matrix);});
 l.pads.instanceMatrix.needsUpdate=l.flowers.instanceMatrix.needsUpdate=true;l.pads.instanceColor.needsUpdate=true;
}
const place=(o,x,z,rot=0,lift=0,s=1)=>{o.position.set(x,Math.max(.06,terrainHeight(x,z))+lift,z);o.rotation.y=rot;o.scale.setScalar(s);return o;};
function landmarks(){
 const out={},g=new T.Group();
 for(const entry of layout.landmarks){
  const o=place(landmark(entry.model,entry.parameters),...entry.at,entry.rotation,entry.lift,entry.scale);
  if(entry.absoluteY!==undefined)o.position.y=entry.absoluteY;
  o.name=entry.id;
  if(entry.spotId){o.traverse(c=>{c.userData.spot=entry.spotId;});out[entry.spotId]={object:o,top:o.userData.top*o.scale.x};}
  g.add(o);
 }
 const pond=new T.Mesh(new T.CircleGeometry(layout.pond.radius,32),new T.MeshStandardMaterial({color:style.water.pond,roughness:style.geometry==='folded-paper'?1:.2,metalness:.1}));
 place(pond,...layout.pond.at,0,.012);pond.rotation.x=-Math.PI/2;g.add(pond);
 const koi=[];for(let i=0;i<layout.pond.koi;i++){const k=new T.Mesh(new T.CapsuleGeometry(.022,.06,3,6).rotateZ(Math.PI/2),new T.MeshStandardMaterial({color:i%3?'#f26b2a':'#f7f1e6',roughness:.5}));k.position.y=pond.position.y+.01;k.userData={r:.12+i*.042,s:.4+i*.07,p:i};koi.push(k);g.add(k);}
 return {group:g,spots:out,koi,pond};
}
function sky(){
 const m=new T.Mesh(new T.SphereGeometry(320,32,16),new T.ShaderMaterial({side:T.BackSide,depthWrite:false,depthTest:false,uniforms:{uTop:{value:C('#8fc0e6')},uHor:{value:C('#f6e7d8')},uBot:{value:C('#e9dccb')},uStars:{value:0}},
  vertexShader:`varying vec3 vD;void main(){vD=normalize(position);vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=p.xyww;}`,
  fragmentShader:`uniform vec3 uTop,uHor,uBot;uniform float uStars;varying vec3 vD;float h(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453);}
void main(){float y=vD.y;vec3 c=y>0.?mix(uHor,uTop,pow(smoothstep(0.,.75,y),.8)):mix(uHor,uBot,smoothstep(0.,-.35,y));
vec3 q=floor(vD*260.);float s=step(.9965,h(q))*smoothstep(.05,.4,y)*uStars;c+=vec3(s)*(.6+.4*sin(h(q)*40.));gl_FragColor=vec4(c,1.);
#include <colorspace_fragment>
}`}));
 m.frustumCulled=false;m.renderOrder=-1;return m;
}
function softTexture(draw,w=256,h=256){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;}
const cloudTex=()=>softTexture((x,w,h)=>{const r=rng(9);for(let i=0;i<26;i++){const cx=w*(.18+r()*.64),cy=h*(.42+r()*.28),rad=h*(.12+r()*.2),g=x.createRadialGradient(cx,cy,0,cx,cy,rad);g.addColorStop(0,'rgba(255,255,255,.55)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,w,h);}},512,256);
const glowTex=()=>softTexture((x,w,h)=>{const g=x.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.18,'rgba(255,255,255,.9)');g.addColorStop(.24,'rgba(255,255,255,.35)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,w,h);});
const dotTex=()=>softTexture((x,w,h)=>{const g=x.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,w,h);},64,64);
function clouds(){
 const tex=cloudTex(),rand=rng(21),list=[];
 for(let i=0;i<26;i++){
  const below=i<10,mat=new T.SpriteMaterial({map:tex,transparent:true,depthWrite:false,opacity:below?.9:.62,fog:true}),s=new T.Sprite(mat);mat.userData.base=mat.opacity;
  const a=rand()*Math.PI*2,r=below?18+rand()*22:30+rand()*26;s.userData={a,r,y:below?-5.5-rand()*3:2+rand()*9,speed:(rand()*.5+.3)*.01*(rand()<.5?1:-1),below};
  const sc=below?22+rand()*16:16+rand()*14;s.scale.set(sc,sc*.45,1);list.push(s);
 }
 return list;
}
function particles(count,color,size){
 const g=new T.BufferGeometry(),p=new Float32Array(count*3),seed=new Float32Array(count);const r=rng(count);
 for(let i=0;i<count;i++){p[i*3]=(r()-.5)*48;p[i*3+1]=r()*14;p[i*3+2]=(r()-.5)*48;seed[i]=r();}
 g.setAttribute('position',new T.BufferAttribute(p,3));g.userData.seed=seed;
 const m=new T.Points(g,new T.PointsMaterial({map:dotTex(),color,size,transparent:true,opacity:0,depthWrite:false,sizeAttenuation:true}));m.frustumCulled=false;return m;
}
function birds(){
 const list=[],mat=new T.MeshBasicMaterial({color:'#f7f4ec',side:T.DoubleSide});
 for(let i=0;i<7;i++){const b=new T.Group(),wing=new T.BufferGeometry().setFromPoints([new T.Vector3(0,0,-.05),new T.Vector3(.26,0,.02),new T.Vector3(0,0,.07)]);const l=new T.Mesh(wing,mat),r=new T.Mesh(wing,mat);r.scale.x=-1;b.add(l,r);b.userData={l,r,a:i*.9,rad:6+i*1.6,y:3.2+i*.35,s:.08+i*.012,cx:-3+i,cz:-2+i*.5};list.push(b);}
 return list;
}
function lakeBoats(){
 const loops=layout.boatLoops,list=[];
 loops.forEach(([c,rx,rz],i)=>{for(let k=0;k<(i<2?3:1);k++){const b=boat();b.userData={c,rx,rz,p:k*2.1+i,s:(.035+i*.006)*(i%2?1:-1)};b.scale.setScalar(1.25);list.push(b);}});
 return list;
}

function build(){
 const landTex=landTexture(),hemi=new T.HemisphereLight('#d6ecff','#8a9a6a',.9),sun=new T.DirectionalLight('#fff1dc',2.6);
 sun.castShadow=true;sun.shadow.mapSize.set(layout.quality.shadowMapSize,layout.quality.shadowMapSize);Object.assign(sun.shadow.camera,{left:-30,right:30,top:30,bottom:-30,near:1,far:140});sun.shadow.bias=-.0004;sun.shadow.normalBias=.02;
 sun.target.position.set(0,0,-1);scene.add(hemi,sun,sun.target);
 const skyM=sky(),ter=terrain(),wat=water(landTex),veg=vegetation(Object.values(SPOT_GEO).map(g=>g.label)),lot=lotusField(),lm=landmarks(),cl=clouds(),bd=birds(),bt=lakeBoats();
 const petals=particles(900,'#f7b5c6',.16),flakes=particles(2200,'#ffffff',.12);
 const moon=new T.Sprite(new T.SpriteMaterial({map:glowTex(),color:'#fff6dc',transparent:true,depthWrite:false,fog:false,opacity:0}));moon.scale.setScalar(40);
 scene.add(skyM,ter,skirt(),wat,paths(),veg.group,lot.group,city(),lanterns(),lm.group,...cl,...bd,...bt,petals,flakes,moon);
 const halo=glowTex(),halos=[];
 const addHalo=(x,y,z,size,color,k=1)=>{const h=new T.Sprite(new T.SpriteMaterial({map:halo,color,transparent:true,depthWrite:false,blending:T.AdditiveBlending,opacity:0,fog:false}));h.position.set(x,y,z);h.scale.setScalar(size);h.userData.k=k;halos.push(h);scene.add(h);};
 const st=lm.spots[layout.landmarks.find(m=>m.model==='three-lanterns')?.spotId]?.object;if(st){st.updateMatrixWorld(true);st.children.forEach(l=>{const p=l.getWorldPosition(new T.Vector3());addHalo(p.x,p.y+.62,p.z,1.6,'#ffb860',.9);addHalo(p.x,.03,p.z+.5,1.1,'#ff9c40',.45);});}
 const lf=lm.spots[layout.landmarks.find(m=>m.model==='pagoda')?.spotId]?.object;if(lf){const p=lf.position;for(let i=0;i<5;i++)addHalo(p.x,p.y+.55+i*.42,p.z,1.3-i*.12,'#ffbf6a',.5);}
 const moonGlow=new T.Mesh(new T.CircleGeometry(2.6,40),new T.MeshBasicMaterial({map:halo,color:'#dfe8ff',transparent:true,depthWrite:false,blending:T.AdditiveBlending,opacity:0}));moonGlow.rotation.x=-Math.PI/2;moonGlow.position.set(3.5,.03,-3);moonGlow.renderOrder=3;scene.add(moonGlow);
 parent.fog=new T.Fog('#efe3d6',70,175);
 let mood=structuredClone(MOODS.spring),from=null,to=null,blend=1;
 const lerpMood=(a,b,t)=>{const o={};for(const k of Object.keys(b)){const x=a[k],y=b[k];if(typeof y==='number')o[k]=x+(y-x)*t;else if(typeof y==='string'&&y.startsWith('#'))o[k]='#'+C(x).lerp(C(y),t).getHexString();else if(Array.isArray(y))o[k]=y.map((v,i)=>typeof v==='number'?x[i]+(v-x[i])*t:'#'+C(x[i]).lerp(C(v),t).getHexString());else if(y&&typeof y==='object')o[k]=lerpMood(x,y,t);else o[k]=y;}return o;};
 function apply(m,renderer){
  const su=skyM.material.uniforms;su.uTop.value.set(m.sky[0]);su.uHor.value.set(m.sky[1]);su.uBot.value.set(m.sky[2]);su.uStars.value=m.stars;
  parent.fog.color.set(m.fog);sun.color.set(m.sun.color);sun.intensity=m.sun.i;sun.position.set(...m.sun.dir).normalize().multiplyScalar(60);
  hemi.color.set(m.hemi[0]);hemi.groundColor.set(m.hemi[1]);hemi.intensity=m.hemi[2];
  const wu=wat.material.uniforms;wu.uShallow.value.set(m.water[0]);wu.uDeep.value.set(m.water[1]);wu.uSky.value.set(m.sky[1]);wu.uSunDir.value.set(...m.sun.dir).normalize();wu.uSunCol.value.set(m.sun.color);
  U.uSnow.value=m.snow;U.uNight.value=m.night;U.uGrassTint.value.set(m.grass);
  for(const g of GLOW)g.emissiveIntensity=(g.userData.glow[0]+(g.userData.glow[1]-g.userData.glow[0])*m.night)*m.emissionScale;
  petals.material.opacity=m.petals*.9;flakes.material.opacity=m.flakes*.95;
  moon.material.opacity=m.moon;
  for(const c of cl){c.material.color.set(m.cloud);c.material.opacity=c.material.userData.base*(1-m.night*.55);}
  for(const g of halos)g.material.opacity=g.userData.k*m.night;
  moonGlow.material.opacity=m.moon*.55;
  paintTrees(veg.meshes,m);setLotus(lot,m.lotus,m);
  if(renderer)renderer.toneMappingExposure=m.exposure;
 }
 apply(mood);
 const fall=(pts,t,dt,kind)=>{const p=pts.geometry.attributes.position,seed=pts.geometry.userData.seed;if(pts.material.opacity<.01)return;
  for(let i=0;i<p.count;i++){let y=p.getY(i)-dt*(kind==='snow'?.9+seed[i]*.6:.35+seed[i]*.3);if(y<0)y+=14;p.setY(i,y);if(kind==='petal'){p.setX(i,p.getX(i)+Math.sin(t*.8+seed[i]*20)*dt*.6+dt*.25);}else p.setX(i,p.getX(i)+Math.sin(t+seed[i]*30)*dt*.15);}p.needsUpdate=true;};
 return {
  terrain:ter,water:wat,terrainHeight,groundHeight,spots:lm.spots,moon,createTraveler(){const h=traveler();scene.add(h);return h;},dispose(){disposeTree(scene);},get night(){return mood.night;},
  setMood(id,immediate=false){if(!MOODS[id])return;to=structuredClone(MOODS[id]);from=structuredClone(mood);blend=immediate?1:0;if(immediate){mood=to;apply(mood);}},
  update(t,dt,renderer){
   U.uTime.value=t;
   if(blend<1){blend=Math.min(1,blend+dt/1.6);const e=blend<.5?2*blend*blend:1-(-2*blend+2)**2/2;mood=lerpMood(from,to,e);apply(mood,renderer);}
   for(const c of cl){const u=c.userData;u.a+=u.speed*dt*6;c.position.set(Math.cos(u.a)*u.r,u.y,Math.sin(u.a)*u.r-1);}
   for(const b of bd){const u=b.userData,a=t*u.s+u.a;b.position.set(u.cx+Math.cos(a)*u.rad,u.y+Math.sin(t*1.3+u.a)*.25,u.cz+Math.sin(a)*u.rad*.7);b.rotation.y=-a+(u.s>0?Math.PI:0);const f=Math.sin(t*9+u.a)*.7;u.l.rotation.z=f;u.r.rotation.z=-f;b.scale.setScalar(1);}
   for(const b of bt){const u=b.userData,a=t*u.s+u.p,x=u.c[0]+Math.cos(a)*u.rx,z=u.c[1]+Math.sin(a)*u.rz;b.position.set(x,.02+Math.sin(t*2+u.p)*.012,z);b.rotation.y=Math.atan2(-Math.sin(a)*u.rx*u.s,Math.cos(a)*u.rz*u.s)+Math.PI/2;b.visible=landField(x,z)<-.25;}
   lm.koi.forEach(k=>{const u=k.userData,a=t*u.s+u.p;k.position.x=lm.pond.position.x+Math.cos(a)*u.r;k.position.z=lm.pond.position.z+Math.sin(a)*u.r;k.rotation.y=-a;});
   fall(petals,t,dt,'petal');fall(flakes,t,dt,'snow');
  },
 };
}

return build();
}
