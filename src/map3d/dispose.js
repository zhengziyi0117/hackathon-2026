// Dispose a single owned scene tree, including shader textures, once per resource.
export function disposeTree(root){
 const geometries=new Set(),materials=new Set(),textures=new Set();
 root.traverse(o=>{
  if(o.geometry)geometries.add(o.geometry);
  for(const m of [o.material].flat().filter(Boolean)){
   materials.add(m);
   for(const value of Object.values(m))if(value?.isTexture)textures.add(value);
   for(const u of Object.values(m.uniforms||{}))if(u?.value?.isTexture)textures.add(u.value);
  }
  o.shadow?.map?.dispose();
 });
 geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());
 root.removeFromParent();
}
