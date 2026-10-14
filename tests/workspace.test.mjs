import test from 'node:test';
import assert from 'node:assert/strict';
import {createScenicState,createWorkspace,upgradeWorkspace,newScenic,newSpot,putPhoto,publishScenic,draftChanges,refsIn} from '../src/scenic-core.js';

test('a single-scenic state becomes the West Lake entry of a workspace',()=>{
  const old=createScenicState();delete old.id;delete old.draft.intro;delete old.published.intro;old.draft.spots[1].name='改过的断桥';
  const ws=upgradeWorkspace(old);
  assert.equal(ws.schema,8);assert.equal(ws.scenics.length,1);
  const [sc]=ws.scenics;assert.equal(sc.id,'westlake');assert.equal(sc.draft.spots[1].name,'改过的断桥');
  assert.equal(sc.draft.intro,sc.published.intro);
  assert.deepEqual(upgradeWorkspace(ws),ws);
  assert.equal(upgradeWorkspace(null).scenics.length,1);
});
test('a new scenic stays unpublished until it has a spot with a photo',()=>{
  const sc=newScenic('灵隐',{url:'idb:map1',name:'map',custom:true});
  assert.equal(sc.published,null);assert.deepEqual(draftChanges(sc),['首次发布「灵隐」']);
  assert.throws(()=>publishScenic(sc));
  const s=newSpot('a1');s.name='飞来峰';sc.draft.spots.push(s);putPhoto(s,'front',{url:'idb:p1',kind:'upload'});
  publishScenic(sc);assert.equal(sc.publishNumber,1);assert.equal(sc.published.spots.length,1);assert.deepEqual(draftChanges(sc),[]);
  const ws=createWorkspace();ws.scenics.push(sc);
  assert.deepEqual([...refsIn(ws)].sort(),['map1','p1']);
});
