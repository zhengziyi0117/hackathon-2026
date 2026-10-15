import test from 'node:test';
import assert from 'node:assert/strict';
import {packageData} from '../src/map3d/packages.js';
import {applyOps,describeMap} from '../src/map3d/ops.js';
import {createGeography} from '../src/map3d/geography.js';

const base=packageData('westlake'),spotIds=Object.keys(base.geography.spots);
const water=(()=>{const g=createGeography(base.geography,base.interaction);for(let x=-6;x<6;x+=.5)for(let z=-6;z<6;z+=.5)if(g.landField(x,z)<-.5)return [x,z];})();

test('a valid batch applies atomically and reports changes for the animation',()=>{
 const r=applyOps(base,[
  {op:'add_node',id:'w5e',at:[-2.1,-16.9]},
  {op:'connect',a:'w5',b:'w5e'},
  {op:'add_landmark',id:'baoshi-ting',model:'pavilion',at:[-2.0,-16.6],rotation:.5,parameters:{size:.4}},
  {op:'add_label',text:'宝石山',at:[-1.5,-18.6],kind:'hill'},
 ],spotIds);
 assert.equal(r.errors,undefined);
 assert.deepEqual(r.changes.map(c=>c.kind+':'+c.action),['node:add','edge:add','landmark:add','label:add']);
 assert.ok(r.pkg.layout.landmarks.some(m=>m.id==='baoshi-ting'));
 assert.ok(!base.layout.landmarks.some(m=>m.id==='baoshi-ting'),'input package is not mutated');
});
test('bad ops and spatially invalid results are rejected without partial changes',()=>{
 for(const ops of [
  [{op:'add_landmark',id:'x',model:'castle',at:[0,0]}],
  [{op:'add_landmark',id:'wet',model:'pavilion',at:water}],
  [{op:'remove_landmark',id:'hg'}],
  [{op:'remove_node',id:'hg'}],
  [{op:'set_spot',id:'not-a-spot',node:'w5',label:[0,0],scene:'x',season:'spring'}],
  [{op:'disconnect',a:'baiM',b:'dq'},{op:'disconnect',a:'dq',b:'dqN'}],
  [{op:'drop_table'}],
 ]){const r=applyOps(base,ops,spotIds);assert.ok(r.errors?.length,JSON.stringify(ops));assert.equal(r.pkg,undefined);}
});
test('describeMap returns compact, filterable views',()=>{
 const o=describeMap(base);assert.equal(o.landmarks.total,base.layout.landmarks.length);assert.ok(JSON.stringify(o).length<6000);
 const near=describeMap(base,{section:'landmarks',center:[-6.85,13.33],radius:1});assert.deepEqual(near.map(m=>m.id),['hg']);
});
