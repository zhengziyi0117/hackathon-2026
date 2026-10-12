import test from 'node:test';
import assert from 'node:assert/strict';
import {createScenicState,completeDemo,confirmSpot,createDemoWorld,publishScenic,putPhoto,removePhoto,visitorExperience,newSpot,upgradeScenicState,answerSpot,publishProblems,draftChanges,roamOf,roamBounds,DEFAULT_ROAM,extraId,orderedPhotos,pendingAngles,refsIn} from '../src/scenic-core.js';
const reviewed=()=>{const state=createScenicState(),s=state.draft.spots[0];completeDemo(s);Object.values(s.photos).forEach(p=>p.accepted=true);confirmSpot(s);return {state,s};};
test('creator edits never leak into the visitor map before publication or after a later draft edit',()=>{
 const state=createScenicState();state.draft.spots[0].name='草稿新名字';state.draft.spots[0].x=.1;
 assert.equal(state.published.spots[0].name,'花港观鱼 · 御碑亭');assert.equal(state.published.spots[0].x,.795);
 publishScenic(state);assert.equal(state.published.spots[0].name,'草稿新名字');state.draft.spots[0].name='第二稿';
 assert.equal(state.published.spots[0].name,'草稿新名字');assert.equal(state.publishNumber,2);
});
test('demo completion fills only missing angles and preserves supplied image provenance',()=>{
 const s=createScenicState().draft.spots[0],front=structuredClone(s.photos.front);
 putPhoto(s,'left',{url:'data:image/png;base64,abc',kind:'upload',name:'侧面实拍',accepted:true});completeDemo(s);
 assert.deepEqual(s.photos.front,front);assert.equal(s.photos.left.kind,'upload');assert.equal(s.photos.rear.kind,'ai-demo');
 assert.equal(s.photos.rear.accepted,false);assert.equal(Object.keys(s.photos).length,6);
 assert.throws(()=>completeDemo(newSpot('empty')),/先上传/);
});
test('unreviewed AI results cannot be confirmed, generated or published',()=>{
 const state=createScenicState(),s=state.draft.spots[0];completeDemo(s);
 assert.throws(()=>confirmSpot(s),/逐张/);assert.throws(()=>createDemoWorld(s,s.revision),/重新审核/);
 assert.throws(()=>publishScenic(state),/未审核/);
});
test('changing any image invalidates confirmation and the previous world result',()=>{
 const {s}=reviewed();const revision=s.revision;createDemoWorld(s,revision);assert.equal(s.world.kind,'demo');
 putPhoto(s,'rear',{url:'/different.png',name:'replacement',kind:'upload',accepted:true});
 assert.equal(s.confirmedRevision,null);assert.equal(s.world,null);assert.throws(()=>createDemoWorld(s,revision),/变化/);
});
test('removing an accepted angle blocks confirmation until that angle is replaced',()=>{
 const {s}=reviewed();removePhoto(s,'inside');assert.throws(()=>confirmSpot(s),/补齐/);
 completeDemo(s);assert.equal(s.photos.inside.accepted,false);assert.throws(()=>confirmSpot(s),/逐张/);
});
test('publishing six reviewed views and a mock job preserves the real pilot and isolates other spots',()=>{
 const {state,s}=reviewed();const other=structuredClone(state.draft.spots[1]);
 createDemoWorld(s,s.revision);publishScenic(state);
 assert.deepEqual(state.draft.spots[1],other);assert.equal(visitorExperience(state.published.spots[0]),'world');
 assert.equal(Object.keys(state.published.spots[0].photos).length,6);
 assert.equal(visitorExperience(state.published.spots[1]),'gallery');
 assert.equal(visitorExperience(createScenicState().published.spots[0]),'world');
});
test('empty maps and points without usable metadata cannot publish',()=>{
 const state=createScenicState();state.draft.spots.push(newSpot('new'));assert.throws(()=>publishScenic(state),/至少/);
 state.draft.spots=[];assert.throws(()=>publishScenic(state),/至少一个/);
});

test('sample completion is limited to the exact pilot reference and cannot mislabel another attraction',()=>{
 const state=createScenicState();assert.throws(()=>completeDemo(state.draft.spots[1]),/仅提供/);
 const s=state.draft.spots[0];putPhoto(s,'front',{url:'data:image/jpeg;base64,custom',kind:'upload',accepted:true});
 assert.throws(()=>completeDemo(s),/仅提供/);
});
test('migrating an old custom project preserves uploads and user pins',()=>{
 const state=createScenicState();state.schema=2;state.draft.map.custom=true;
 state.draft.spots.push({...newSpot('user-place'),name:'我的景点',photos:{front:{url:'data:image/png;base64,uploaded',kind:'upload'}}});
 const before=structuredClone(state.draft);const next=upgradeScenicState(state);
 assert.equal(next.schema,7);assert.deepEqual(next.draft,before);
});
test('the pilot remains available after supplement edits but never after changing its source photo',()=>{
 const state=createScenicState(),s=state.draft.spots[0];
 putPhoto(s,'back',{url:'/back.jpg',kind:'upload',accepted:true});
 assert.equal(s.world,null);assert.equal(visitorExperience(s),'world');
 const other=state.draft.spots[1];other.pilotAsset=structuredClone(s.pilotAsset);
 assert.equal(visitorExperience(other),'gallery');
 putPhoto(s,'front',{url:'data:image/jpeg;base64,changed',kind:'upload',accepted:true});
 assert.equal(visitorExperience(s),'gallery');removePhoto(s,'front');assert.equal(visitorExperience(s),'gallery');
});
test('migration restores a real pilot hidden by a mock job without replacing published photos',()=>{
 const {state,s}=reviewed();createDemoWorld(s,s.revision);publishScenic(state);state.schema=5;
 delete state.draft.spots[0].pilotAsset;delete state.published.spots[0].pilotAsset;
 delete state.published.spots[0].photos.back;delete state.published.spots[0].photos.top;
 const photos=structuredClone(state.published.spots[0].photos);
 const next=upgradeScenicState(state);
 assert.equal(visitorExperience(next.published.spots[0]),'world');
 assert.deepEqual(next.published.spots[0].photos,photos);assert.equal(next.published.spots[0].world.kind,'demo');
});

test('back and top are separate review requirements and older confirmation is invalidated',()=>{
 const {state,s}=reviewed();assert.ok(s.photos.back);assert.ok(s.photos.top);
 state.schema=4;delete s.photos.back;delete s.photos.top;s.world={kind:'demo',revision:s.revision};
 const published=structuredClone(state.published);state.publishedAt='2026-10-12T00:00:00Z';
 const migrated=upgradeScenicState(state);assert.equal(s.confirmedRevision,null);assert.equal(s.world,null);
 assert.deepEqual(migrated.published,published);assert.throws(()=>confirmSpot(s),/背面/);
 completeDemo(s);assert.equal(s.photos.back.accepted,false);assert.equal(s.photos.top.accepted,false);
});
test('guide answers only from staff-written material and admits gaps',()=>{
 const s={...newSpot('x'),name:'雷峰塔',guide:'原塔建于五代。现在的塔是 2002 年重建的。'};
 assert.deepEqual(answerSpot(s,'什么时候重建的'),{text:'现在的塔是 2002 年重建的。',known:true});
 assert.equal(answerSpot(s,'讲讲这里').text,s.guide);
 assert.equal(answerSpot(s,'今天几点开放').known,false);
 assert.equal(answerSpot(s,'附近有什么好吃的').known,false);
 s.notice='周一闭馆维护';assert.deepEqual(answerSpot(s,'今天开放吗'),{text:'周一闭馆维护',known:true});
 assert.equal(answerSpot({...newSpot('y'),name:'新'},'讲讲').known,false);
});
test('schema 7 backfills built-in guide text without overwriting staff edits',()=>{
 const st=createScenicState();st.schema=6;delete st.draft.spots[0].guide;st.draft.spots[1].guide='自写讲解';
 const up=upgradeScenicState(st);assert.equal(up.schema,7);assert.match(up.draft.spots[0].guide,/西湖十景/);assert.equal(up.draft.spots[1].guide,'自写讲解');
});
test('publish checklist points each problem at the spot and tab that fixes it',()=>{
 const state=createScenicState(),s=state.draft.spots[0];completeDemo(s);s.photos.left.accepted=true;state.draft.spots[1].name=' ';
 const p=publishProblems(state.draft);
 assert.deepEqual(p.map(x=>[x.spotId,x.tab]),[['huagang','photos'],['duanqiao','info']]);assert.match(p[0].text,/4 张 AI 图片未审核/);
 assert.throws(()=>publishScenic(state),/未审核/);
});
test('draft changes list what publishing will update',()=>{
 const state=createScenicState();state.draft=structuredClone(state.published);assert.deepEqual(draftChanges(state),[]);
 state.draft.title='新名字';state.draft.spots[1].guide='改了';state.draft.spots.pop();state.draft.spots.push(newSpot('n'));
 assert.deepEqual(draftChanges(state),['景区名称改为「新名字」','断桥：内容有修改','新增景点：新的景点','移除景点：雷峰塔']);
});
test('roaming range defaults, clamps bad input and maps to camera bounds',()=>{
 assert.deepEqual(roamOf({}),DEFAULT_ROAM);
 assert.deepEqual(roamOf({roam:{front:9,back:-1,left:'x'}}),{...DEFAULT_ROAM,front:5,back:0});
 assert.deepEqual(roamBounds({front:2,back:.5,left:1,right:1.5,up:.3,down:.4}),{min:[-1,-.4,-2],max:[1.5,.3,.5]});
});
test('extra photos are unlimited, ordered after the six angles and do not fill angle slots',()=>{
 const s=newSpot('x');putPhoto(s,'left',{url:'/l.jpg',kind:'upload'});
 for(let i=0;i<30;i++)putPhoto(s,extraId(),{url:'/e'+i+'.jpg',kind:'upload'});
 putPhoto(s,'front',{url:'/f.jpg',kind:'upload'});
 const keys=orderedPhotos(s).map(([k])=>k);assert.equal(keys.length,32);assert.deepEqual(keys.slice(0,2),['front','left']);
 assert.equal(pendingAngles(s).length,4);assert.throws(()=>putPhoto(s,'../x',{}),/未知视角/);
});
test('stored image references are shared by draft and published and collected once',()=>{
 const st=createScenicState(),s=st.draft.spots[1];putPhoto(s,'left',{url:'idb:aa11',kind:'upload'});putPhoto(s,extraId(),{url:'idb:bb22',kind:'upload'});
 st.draft.map={url:'idb:cc33',custom:true};publishScenic(st);putPhoto(st.draft.spots[2],'left',{url:'idb:aa11',kind:'upload'});
 assert.deepEqual([...refsIn(st)].sort(),['aa11','bb22','cc33']);
});
