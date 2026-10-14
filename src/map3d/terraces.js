import * as T from 'three';

// One surface mesh plus one instanced stud mesh, regardless of the tile count.
export function createTerraces(surface,geo,style,weatherize){
 const group=new T.Group(),pos=[],normal=[],colors=[],grass=[];
 const meadow=new T.Color(style.terrain.meadow),forest=new T.Color(style.terrain.forest),edge=new T.Color(style.terrain.rock),color=new T.Color();
 const face=(points,n,c,tint)=>{
  for(const i of [0,1,2,0,2,3]){pos.push(...points[i]);normal.push(...n);colors.push(c.r,c.g,c.b);grass.push(tint);}
 };
 for(const t of surface.tiles){
  const {x,z,y,dx,dz,neighbours}=t,x0=x-dx/2,x1=x+dx/2,z0=z-dz/2,z1=z+dz/2;
  const r=(Math.sin(t.i*12.98+t.j*78.23)*43758.54)%1;
  color.copy(meadow).lerp(forest,Math.min(.8,geo.hillHeight(x,z)/3)).multiplyScalar(1+r*.035);
  face([[x0,y,z1],[x1,y,z1],[x1,y,z0],[x0,y,z0]],[0,1,0],color,1);
  color.lerp(edge,.24).multiplyScalar(.94);
  const [w,e,n,s]=neighbours;
  if(w<y)face([[x0,w,z0],[x0,w,z1],[x0,y,z1],[x0,y,z0]],[-1,0,0],color,.35);
  if(e<y)face([[x1,e,z1],[x1,e,z0],[x1,y,z0],[x1,y,z1]],[1,0,0],color,.35);
  if(n<y)face([[x1,n,z0],[x0,n,z0],[x0,y,z0],[x1,y,z0]],[0,0,-1],color,.35);
  if(s<y)face([[x0,s,z1],[x1,s,z1],[x1,y,z1],[x0,y,z1]],[0,0,1],color,.35);
 }
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('normal',new T.Float32BufferAttribute(normal,3));g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.setAttribute('aGrass',new T.Float32BufferAttribute(grass,1));
 const m=new T.Mesh(g,weatherize(new T.MeshStandardMaterial({vertexColors:true,roughness:style.surface.roughness}),{tint:true,key:'terraces'}));m.receiveShadow=m.castShadow=true;m.name='terraced-hills';group.add(m);
 if(style.geometry==='bricks'){
  const r=style.landform.cell*.15,studs=new T.InstancedMesh(new T.CylinderGeometry(r,r,.055,10),weatherize(new T.MeshStandardMaterial({roughness:.32}),{key:'terrain-studs'}),surface.tiles.length),d=new T.Object3D();
  surface.tiles.forEach((t,i)=>{d.position.set(t.x,t.y+.0275,t.z);d.updateMatrix();studs.setMatrixAt(i,d.matrix);color.copy(meadow).lerp(forest,Math.min(.8,geo.hillHeight(t.x,t.z)/3));studs.setColorAt(i,color);});
  studs.castShadow=studs.receiveShadow=true;studs.name='terrain-studs';group.add(studs);
 }
 return group;
}
