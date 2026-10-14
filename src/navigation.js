// Navigation uses the generated world's metric frame; it is not real-site navigation.
export function navigationStep(position,forward,direction,distance){
  const p=[...position],horizontal=Math.hypot(forward[0],forward[2])||1;
  const x=forward[0]/horizontal,z=forward[2]/horizontal;
  if(direction==='up')p[1]+=distance;
  else if(direction==='down')p[1]-=distance;
  else if(direction==='forward'){p[0]+=x*distance;p[2]+=z*distance;}
  else if(direction==='back'){p[0]-=x*distance;p[2]-=z*distance;}
  else if(direction==='right'){p[0]-=z*distance;p[2]+=x*distance;}
  else if(direction==='left'){p[0]+=z*distance;p[2]-=x*distance;}
  return p;
}
export function navigationDistance(position,origin){return Math.hypot(...position.map((x,i)=>x-origin[i]));}
// Box limits are offsets from home; outside the area the source photo covers, a generated splat turns to blur.
export function clampToBounds(position,home,bounds){
  if(!bounds)return position;
  return position.map((v,i)=>Math.min(home[i]+bounds.max[i],Math.max(home[i]+bounds.min[i],v)));
}
