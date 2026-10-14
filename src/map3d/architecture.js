import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Reusable palace components; all site positions and dimensions live in the map package.
export function createArchitectureKit({MAT,SHAPE,weatherize}){
 const brick=SHAPE.playful;
 // Tile relief is shader-filtered: it fades before the tile pitch is subpixel.
 // Separate tube ribs cast unstable micro-shadows, especially in the overview.
 const roofMat=weatherize(MAT.roof.clone(),{key:'palace-roof'});
 roofMat.shadowSide=T.FrontSide;roofMat.roughness=.78;
 const roofCompile=roofMat.onBeforeCompile;
 roofMat.onBeforeCompile=shader=>{roofCompile(shader);shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
 vec2 tile=vPaper.xz*vec2(6.25,8.0);
 float footprint=max(fwidth(tile.x),fwidth(tile.y));
 float tileDetail=(1.-smoothstep(.12,.5,footprint))*(1.-uSnow);
 float tileRib=cos(tile.x*6.28318)*.025+cos(tile.y*6.28318)*.012;
 diffuseColor.rgb*=1.+tileRib*tileDetail;
 `);};
 roofMat.customProgramCacheKey=()=> 'palace-roof-filtered-v1'+brick;
 const accent=weatherize(MAT.robe.clone(),{key:'palace-painted-beam'});
 accent.roughness=.9;
 return function architecture(kind,p={}){
  const turn=(kind==='palace-hall'&&(p.depth||2)>(p.width||3));
  const w=(turn?p.depth:p.width)||3,d=(turn?p.width:p.depth)||2,h=p.height||1,base=p.base||.12,tiers=p.tiers||1,roof=p.roof||1;
  const parts=new Map(),g=new T.Group();let top=0;
  const add=(geo,mat,x=0,y=0,z=0,ry=0)=>{geo.deleteAttribute('uv');geo.rotateY(ry);geo.translate(x,y,z);const a=parts.get(mat)||[];a.push(geo);parts.set(mat,a);};
  const box=(a,b,c,mat,x=0,y=0,z=0)=>add(new T.BoxGeometry(a,b,c),mat,x,y,z);
  const cyl=(r,len,mat,x,y,z)=>add(new T.CylinderGeometry(r,r,len,8),mat,x,y,z);
  function roofLayer(rw,rd,rh,y,pyramid=false){
   if(brick){
    for(let i=0;i<6;i++){const t=i/6;box(rw*(1-t*.8),rh/6,rd*(1-t*.85),MAT.roof,0,y+rh*(t+.08),0);}
    for(let x=-rw*.42;x<rw*.43;x+=.3)for(const z of [-rd*.41,rd*.41])cyl(.055,.045,MAT.roof,x,y+rh*.17,z);
   }else{
    const rings=9,cols=48,pos=[],idx=[],ridge=pyramid?0:Math.max(0,rw-rd)*.38;
    for(let r=0;r<=rings;r++){
     const t=r/rings;
     for(let j=0;j<=cols;j++){
      const a=j/cols*4,k=Math.floor(a)%4,u=a-Math.floor(a);
      const v=k===0?[1,u*2-1]:k===1?[1-u*2,1]:k===2?[-1,1-u*2]:[u*2-1,-1];
      const x=v[0]*(ridge+(rw/2-ridge)*t),z=v[1]*rd/2*t;
      pos.push(x,y+rh*(1-t)**1.7+rh*.2*t**4*Math.abs(v[0]*v[1]),z);
     }
    }
    for(let r=0;r<rings;r++)for(let j=0;j<cols;j++){const a=r*(cols+1)+j,b=a+cols+1;idx.push(a,a+1,b,b,a+1,b+1);}
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));geo.setIndex(idx);geo.computeVertexNormals();add(geo,roofMat);
    // Broad hip ridges retain the silhouette without high-frequency geometry.
    for(const sx of [-1,1])for(const sz of [-1,1]){
     const pts=[];for(let j=0;j<=8;j++){const t=j/8;pts.push(new T.Vector3(sx*(ridge+(rw/2-ridge)*t),y+rh*(1-t)**1.7+rh*.2*t**4+.025,sz*rd/2*t));}
     add(new T.TubeGeometry(new T.CatmullRomCurve3(pts),12,.023,5,false),MAT.roofBronze);
    }
    box(Math.max(.04,ridge*2),.045,.045,MAT.gold,0,y+rh,0);
   }
   for(const s of [-1,1]){box(rw,.05,.045,MAT.gold,0,y+.015,s*rd*.5);}
   if(pyramid)cyl(.055,.18,MAT.gold,0,y+rh+.05,0);
   else for(const x of [-1,1]){cyl(.045,.16,MAT.gold,x*Math.max(.1,(rw-rd)*.38),y+rh+.06,0);}
   top=Math.max(top,y+rh+.18);
  }
  function balustrade(a,b,y){
   for(const z of [-b/2,b/2]){
    for(let x=-a/2;x<=a/2+.01;x+=.4)if(!(z>0&&Math.abs(x)<.35)){box(.055,.22,.055,MAT.stone,x,y+.11,z);cyl(.045,.04,MAT.stone,x,y+.24,z);}
    for(const x of [-1,1])box(a/2-.35,.035,.04,MAT.stone,x*(a/4+.175),y+.16,z);
   }
   for(const x of [-a/2,a/2]){box(.04,.035,b,MAT.stone,x,y+.16,0);for(let z=-b/2;z<=b/2;z+=.4)box(.055,.22,.055,MAT.stone,x,y+.11,z);}
  }
  if(kind==='palace-wall'){
   box(w,h,d,MAT.wall,0,h/2,0);box(w+.04,.065,d+.08,MAT.roof,0,h+.025,0);box(w,.1,d+.06,MAT.stoneDark,0,.05,0);top=h+.1;
  }else if(kind==='palace-platform'){
   for(let i=0;i<3;i++){const k=1-i*.06;box(w*k,h/3,d*k,MAT.stone,0,h*(i+.5)/3,0);balustrade(w*k,d*k,h*(i+1)/3);}
   const steps=9;for(let i=0;i<steps;i++)box(.75,h*(i+1)/steps,.15,MAT.stone,0,h*(i+1)/steps/2,d/2+.15*(steps-i));top=h+.27;
  }else if(kind==='palace-paving'){
   box(w,.04,d,MAT.stoneDark,0,.02,0);top=.05;
   for(let z=-d/2;z<d/2;z+=.7)box(w,.008,.018,MAT.stone,0,.045,z);
  }else if(kind==='palace-gate'){
   const gap=p.gap||.8;
   for(const x of [-1,1])box((w-gap)/2,h,d,MAT.wall,x*(w+gap)/4,h/2,0);
   box(gap,h*.24,d,MAT.wall,0,h*.88,0);box(w+.1,.09,d+.14,MAT.stone,0,h+.02,0);
   box(w*.78,h*.55,d*.8,MAT.wood,0,h*1.28,0);
   for(let x=-w*.34;x<=w*.35;x+=.55)box(.08,h*.55,.07,MAT.woodDark,x,h*1.28,d*.41);
   box(w*.8,.12,d*.86,accent,0,h*1.51,0);
   roofLayer(w*1.05,d*1.35,h*.55,h*1.55);top=Math.max(top,h*2.2);
  }else{
   const tower=kind==='palace-tower';
   box(w,base,d,MAT.stone,0,base/2,0);
   box(w*.82,h,d*.75,MAT.wall,0,base+h/2,0);
   box(w*.9,.075,d*.84,MAT.stoneDark,0,base+.04,0);
   for(const z of [-d*.42,d*.42]){
    const bays=Math.max(3,Math.round(w/.62));
    for(let i=0;i<=bays;i++){const x=-w*.45+w*.9*i/bays;cyl(.035,h,MAT.wood,x,base+h/2,z);}
    box(w*.96,.13,.09,accent,0,base+h-.03,z);
    for(let x=-w*.4;x<=w*.41;x+=.5){box(.14,.1,.15,MAT.gold,x,base+h-.13,z);box(.2,.04,.19,accent,x,base+h-.08,z);}
    box(w*.94,.035,.075,MAT.gold,0,base+h+.04,z);
    for(let x=-w*.34;x<=w*.35;x+=.48){box(.31,h*.65,.03,MAT.woodDark,x,base+h*.43,z*.94);box(.27,h*.28,.035,MAT.wood,x,base+h*.27,z*.96);box(.02,h*.6,.04,MAT.gold,x,base+h*.43,z*.97);}
   }
   for(let i=0;i<tiers;i++){
    const factor=1-i*.18,yy=base+h+i*h*.32;
    if(i)box(w*factor*.7,h*.32,d*factor*.65,MAT.wood,0,yy-h*.16,0);
    roofLayer(w*1.15*factor,d*1.24*factor,h*(tower?.48:.5),yy,roof===2);
   }
   // A restrained pair of bronze vessels gives the major halls a human scale.
   if(w>3&&d>1.4&&!tower)for(const sign of [-1,1]){
    const x=sign*w*.43,z=d*.5+.13;
    box(.27,.07,.27,MAT.stone,x,.035,z);
    add(new T.CylinderGeometry(.11,.08,.19,10),MAT.roofBronze,x,.17,z);
    add(new T.TorusGeometry(.11,.015,5,12).rotateX(Math.PI/2),MAT.gold,x,.27,z);
   }
   if(tower){const side=new T.BoxGeometry(w*.8,h*.45,d*.8);add(side,MAT.wood,0,base+h*.4,0);}
  }
  for(const [mat,gs] of parts){const flat=gs.map(x=>x.index?x.toNonIndexed():x),geo=mergeGeometries(flat);for(const x of new Set([...gs,...flat]))x.dispose();const m=new T.Mesh(geo,mat);m.castShadow=m.receiveShadow=true;g.add(m);}
  if(turn)g.children.forEach(m=>m.geometry.rotateY(Math.PI/2));
  g.userData.top=top;return g;
 };
}
