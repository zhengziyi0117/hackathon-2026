// Scroll progress (0..1) of a sticky story split into n equal segments.
// stepRange gives monotonic input/output arrays for useTransform: step i is fully visible inside its segment
// and crossfades over `fade` at each inner border; the first and last steps stay visible at the ends.
export function stepRange(i,n,fade=.06){
  const a=i/n,b=(i+1)/n,f=fade/2;
  if(n<2)return [[0,1],[1,1]];
  if(i===0)return [[0,b-f,b+f],[1,1,0]];
  if(i===n-1)return [[a-f,a+f,1],[0,1,1]];
  return [[a-f,a+f,b-f,b+f],[0,1,1,0]];
}
export const activeStep=(p,n)=>Math.min(n-1,Math.max(0,Math.floor(p*n)));
// Local 0..1 progress inside step i, for animations that play while that step is on screen.
export const stepLocal=(i,n)=>[i/n,(i+1)/n];
