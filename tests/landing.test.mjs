import test from 'node:test';
import assert from 'node:assert/strict';
import {stepRange,activeStep} from '../src/landing-motion.js';
const at=([xs,ys],p)=>{if(p<=xs[0])return ys[0];for(let k=1;k<xs.length;k++)if(p<=xs[k])return ys[k-1]+(ys[k]-ys[k-1])*(p-xs[k-1])/(xs[k]-xs[k-1]);return ys.at(-1);};
test('story steps: exactly one step is fully visible mid-segment, ranges are monotonic',()=>{
  const n=4;
  for(let i=0;i<n;i++){
    const r=stepRange(i,n);
    assert.equal(r[0].length,r[1].length);
    for(let k=1;k<r[0].length;k++)assert.ok(r[0][k]>r[0][k-1],'input must increase');
    const mid=(i+.5)/n;
    for(let j=0;j<n;j++)assert.equal(at(stepRange(j,n),mid),j===i?1:0);
    assert.equal(activeStep(mid,n),i);
  }
  assert.equal(at(stepRange(0,n),0),1,'first step visible before scrolling');
  assert.equal(at(stepRange(n-1,n),1),1,'last step stays visible at the end');
  assert.equal(activeStep(1,n),n-1);assert.equal(activeStep(-.2,n),0);
});
test('crossfade borders sum to full opacity',()=>{
  for(const p of [.24,.25,.26,.5,.74])assert.ok(Math.abs([0,1,2,3].reduce((s,j)=>s+at(stepRange(j,4),p),0)-1)<1e-9);
});
