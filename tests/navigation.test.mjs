import test from 'node:test';
import assert from 'node:assert/strict';
import {navigationStep,navigationDistance,clampToBounds} from '../src/navigation.js';
test('roaming continues beyond the former four-metre boundary and remains reversible',()=>{
 const start=[0,1.45,0];let p=start;
 for(let i=0;i<120;i++)p=navigationStep(p,[0,0,-1],'forward',3/60);
 assert.ok(navigationDistance(p,start)>5.9);
 for(let i=0;i<120;i++)p=navigationStep(p,[0,0,-1],'back',3/60);
 assert.ok(navigationDistance(p,start)<1e-9);
});
test('strafing follows camera heading and altitude changes independently',()=>{
 assert.deepEqual(navigationStep([0,2,0],[1,.8,0],'right',3),[0,2,3]);
 assert.deepEqual(navigationStep([0,2,0],[0,-1,-1],'forward',3),[0,2,-3]);
 assert.deepEqual(navigationStep([0,2,0],[0,0,-1],'up',3),[0,5,0]);
 assert.deepEqual(navigationStep([0,2,0],[0,0,-1],'down',1),[0,1,0]);
});
test('roaming box keeps the camera near the photographed area, relative to home',()=>{
 const home=[0,1.7,0],bounds={min:[-1,-.5,-2],max:[1,.5,.5]};
 assert.deepEqual(clampToBounds([0,1.7,-9],home,bounds),[0,1.7,-2]);
 assert.deepEqual(clampToBounds([5,0,3],home,bounds),[1,1.2,.5]);
 const inside=[.3,1.9,-1];
 assert.deepEqual(clampToBounds(inside,home,bounds),inside);
 assert.deepEqual(clampToBounds([9,9,9],home,undefined),[9,9,9],'no bounds means free roaming');
});
