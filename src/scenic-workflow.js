import {webImageUrl} from './web-images.js';
import {escapeHTML as e,safeURL} from './core.js';
import {ANGLES,copy,newSpot,putPhoto,removePhoto,pendingAngles,completeDemo,confirmProblem,confirmSpot,createDemoWorld,publishScenic,visitorExperience,canCompleteDemo,answerSpot,draftChanges,publishProblems,roamOf,isExtra,extraId,photoName,orderedPhotos} from './scenic-core.js';
import {loadScenic,saveScenic,imageFile,exportState} from './scenic-store.js';
import {mountPilotScene} from './pilot-world.js';
import './scenic.css';

const ic=name=>`<i data-lucide="${name}"></i>`;
const photoLabel=p=>p.kind==='real'?'实景摄影':p.kind==='ai-demo'?'AI 补全 · 示例':p.kind==='concept'?'AI 概念图':p.kind==='reference'?'参考照片':'景区上传';
const cover=s=>s.photos.front||Object.values(s.photos)[0];
const spotLink=s=>'#spot?id='+encodeURIComponent(s.id);
const creditHTML=p=>p?.credit?`<div class="sw-attribution"><span>${e(p.credit.artist)} · ${e(p.credit.date?.split(' ')[0]||'')}</span><span><a href="${e(p.credit.source)}" target="_blank" rel="noopener noreferrer">原照片与作者</a> · <a href="${e(p.credit.licenseUrl)}" target="_blank" rel="noopener noreferrer">${e(p.credit.license)}</a></span><small>${e(p.credit.changes)}</small></div>`:'';
const imageInput=(id,label,multiple=false)=>`<label class="button outline small sw-upload">${ic('upload')}${label}<input id="${id}" type="file" accept="image/jpeg,image/png,image/webp" ${multiple?'multiple':''}></label>`;

export function mountScenic(host,{mode,hydrate,toast}) {
  let alive=true, state, selected=(mode==='map'&&new URLSearchParams(location.hash.split('?')[1]).get('id'))||'huagang', view='map', tab='info', studioScene=null, placement='', busy='', progress=0, saveError='', saving=false, activeAngle='front', jobTimer;
  let galleryDialog,guideFor='',guideLog=[];
  const $=s=>host.querySelector(s), $$=s=>[...host.querySelectorAll(s)];
  const isCreator=mode==='studio';
  const spot=()=>state.draft.spots.find(s=>s.id===selected);
  const notify=message=>{if(alive)toast(message);};
  function frame(body){
    if(!isCreator)return `<header class="header sw-header sw-visitor-header"><a class="brand" href="#map"><img src="/favicon.svg" alt=""><span>景见<small>JINGJIAN</small></span></a></header>${body}`;
    return `<header class="st-top"><a class="brand" href="#studio"><img src="/favicon.svg" alt=""><span>景见<small>STUDIO</small></span></a></header>${body}`;
  }
  async function persist(message,redraw=true){
    saving=true;
    try{await saveScenic(state);saveError='';if(message)notify(message);}catch{saveError='本机保存失败。请立即导出备份，刷新可能丢失本次修改。';notify(saveError);}finally{saving=false;}
    if(!alive)return;if(redraw)draw();else updateStatus();
  }
  function guarded(action){return async ev=>{try{if(!busy)await action(ev);}catch(err){notify(err.message);}};}
  function mapHTML(project,edit=false){
    return `<div class="sw-map-shell ${edit?'sw-edit-map':''}"><div class="sw-map-canvas ${placement?'is-placing':''}" id="scenic-map-canvas"><img class="sw-map-image" src="${e(webImageUrl(project.map.url))}" alt="${e(project.map.name)}" draggable="false">${project.spots.map((s,i)=>`<button class="sw-marker ${selected===s.id?'selected':''}" style="left:${s.x*100}%;top:${s.y*100}%" data-marker="${e(s.id)}" aria-label="选择景点：${e(s.name)}" aria-pressed="${selected===s.id}"><span>${String(i+1).padStart(2,'0')}</span><b>${e(s.name)}</b></button>`).join('')}</div><div class="sw-map-legend"><span>${ic('map')} ${project.map.custom?'景区上传地图':'插画景点索引 · 位置非真实地理坐标'}</span><span>${edit?(placement==='add'?'点击地图放置新景点':placement==='move'?'点击地图设置新位置':'选择点位进行编辑'):''}</span></div></div>`;
  }
  function drawVisitor(){
    const p=state.published;
    if(!p.spots.some(s=>s.id===selected))selected=p.spots[0]?.id;
    if(mode==='spot')return drawDetail();
    const s=p.spots.find(x=>x.id===selected),img=s&&cover(s);
    // One map, one preview card: tapping a pin previews it in place instead of leaving the page.
    const card=s?`<aside class="sw-spot-card" id="spot-card" aria-label="景点预览">${img?`<div class="sw-spot-cover"><img src="${e(webImageUrl(img.url))}" alt=""><span class="sw-tag${['ai-demo','concept'].includes(img.kind)?' ai':''}">${photoLabel(img)}</span></div>`:''}<div class="sw-spot-body"><span class="sw-spot-kind">${ic(visitorExperience(s)==='world'?'box':'images')}${visitorExperience(s)==='world'?'可 3D 漫游':'图片赏景'}</span><h2>${e(s.name)}</h2><p>${e(s.description||'沿着自己的节奏，发现这里的风景。')}</p><div class="sw-spot-actions">${visitorExperience(s)==='world'?`<a class="button primary" href="#pilot">${ic('box')}进入 3D 漫游</a><a class="button outline" href="${spotLink(s)}">${ic('images')}看照片</a>`:`<a class="button primary" href="${spotLink(s)}">${ic('images')}看照片</a>`}</div></div></aside>`:'';
    host.innerHTML=frame(`<main class="sw-visitor page"><div class="sw-visitor-heading"><div><h1>${e(p.title)}</h1><p>点击地图上的景点，看看那里的风景。</p></div></div><div class="sw-explore-layout">${mapHTML(p)}${card}</div></main>`);
    bindMap();
  }
  function drawDetail(){
    const id=new URLSearchParams(location.hash.split('?')[1]).get('id');
    const p=state.published,s=p.spots.find(x=>x.id===id);
    if(!s){host.innerHTML=frame(`<main class="page sw-empty"><h1>这个景点暂时没有开放预览</h1><p>回到地图，发现其他风景。</p><a class="button primary" href="#map">回到景区地图</a></main>`);return;}
    const photos=orderedPhotos(s);if(!s.photos[activeAngle])activeAngle=photos[0]?.[0];const shown=s.photos[activeAngle];
    const index=p.spots.indexOf(s),next=p.spots.length>1?p.spots[(index+1)%p.spots.length]:null;
    const hasAI=Object.values(s.photos).some(x=>['ai-demo','concept'].includes(x.kind));
    host.innerHTML=frame(`<main class="sw-detail page"><a class="sw-back" href="#map?id=${encodeURIComponent(s.id)}">${ic('arrow-left')}回到地图</a><div class="sw-detail-layout"><section><div class="sw-photo-stage"><img src="${e(webImageUrl(shown?.url))}" alt="${e(s.name)} · ${e(photoName(activeAngle))}"><span class="sw-photo-credit">${shown?photoLabel(shown):''}</span>${photos.length>1?`<span class="sw-photo-count">${photos.findIndex(([id])=>id===activeAngle)+1} / ${photos.length}</span>`:''}<button class="sw-expand" id="visitor-enlarge" aria-label="放大当前图片">${ic('maximize')}</button></div>${photos.length>1?`<div class="sw-thumbnails">${photos.map(([id,x])=>`<button data-gallery="${id}" class="${id===activeAngle?'active':''}" aria-label="查看${e(photoName(id))}" aria-pressed="${id===activeAngle}"><img src="${e(webImageUrl(x.url))}" alt=""><span>${e(photoName(id))}</span></button>`).join('')}</div>`:''}${creditHTML(shown)}</section><aside class="sw-story"><h1>${e(s.name)}</h1><p>${e(s.description||'沿着自己的节奏，发现这里的风景。')}</p>${visitorExperience(s)==='world'?`<a class="button primary large full" href="#pilot">${ic('box')}进入 3D 漫游</a><small class="sw-quiet">基于一张正面实拍生成，未拍到的区域由模型推测。</small>`:''}${guideHTML(s)}<details class="sw-sources"><summary>${ic('info')}关于图片与资料</summary>${safeURL(s.factSource)?`<a class="sw-text-link" href="${e(safeURL(s.factSource))}" target="_blank" rel="noopener noreferrer">景点资料来源</a>`:''}<p>${hasAI?'本页包含 AI 概念或补全图像，用于呈现游览氛围；未拍摄部分为推测，实际景观请以现场为准。':'图片用于景观参考；地图为游览示意，实际位置与开放情况请以景区信息为准。'}</p></details>${next?`<a class="sw-next" href="${spotLink(next)}"><span><small>下一处</small>${e(next.name)}</span>${ic('arrow-right')}</a>`:''}</aside></div></main>`);
    $$('[data-gallery]').forEach(b=>b.onclick=()=>{activeAngle=b.dataset.gallery;draw();});
    $('#visitor-enlarge').onclick=()=>showImage(s,activeAngle,false);
    bindGuide(s);
  }
  // One guide widget for visitors and the studio preview; answers come only from spot.guide / spot.notice.
  function guideHTML(s){
    if(guideFor!==s.id){guideFor=s.id;guideLog=[];}
    return `<section class="sw-guide" aria-label="AI 导游"><div class="sw-guide-head">${ic('sparkles')}<b>问问导游</b><small>只依据景区讲解资料回答</small></div><div class="sw-guide-log" id="guide-log" aria-live="polite">${guideLogHTML()}</div><div class="sw-guide-chips">${['讲讲这里','名字怎么来的','有什么提示','今天几点开放'].map(q=>`<button type="button" data-guide-q="${q}">${q}</button>`).join('')}</div><form class="sw-guide-form" id="guide-form"><input id="guide-q" maxlength="200" autocomplete="off" placeholder="关于${e(s.name)}，你想知道…" aria-label="向导游提问"><button type="submit" aria-label="发送">${ic('arrow-up')}</button></form></section>`;
  }
  function guideLogHTML(){
    return guideLog.length?guideLog.map(m=>m.role==='user'?`<p class="sw-guide-q">${e(m.text)}</p>`:`<div class="sw-guide-a"><p>${e(m.text)}</p><small>${m.known?'来自景区讲解资料':'资料中未找到 · 不作推测'}</small></div>`).join(''):'<p class="sw-guide-empty">点一个问题，或者直接问。</p>';
  }
  function bindGuide(s){
    const ask=q=>{q=q.trim();if(!q)return;guideLog.push({role:'user',text:q},{role:'guide',...answerSpot(s,q)});guideLog=guideLog.slice(-12);const log=$('#guide-log');log.innerHTML=guideLogHTML();log.scrollTop=log.scrollHeight;};
    $$('[data-guide-q]').forEach(b=>b.onclick=()=>ask(b.dataset.guideQ));
    $('#guide-form').onsubmit=ev=>{ev.preventDefault();const input=$('#guide-q');ask(input.value);input.value='';};
  }
  function photoCard(s,a){
    const p=s.photos[a.id];
    return `<article class="sw-angle ${p?.kind==='ai-demo'?'is-ai':''}"><div class="sw-angle-top"><b>${a.name}</b><span>${p?(p.kind==='ai-demo'?(p.accepted?'已接受':'待审核'):'已导入'):'待补充'}</span></div>${p?`<button class="sw-angle-image" data-inspect="${a.id}" aria-label="查看${a.name}大图"><img src="${e(webImageUrl(p.url))}" alt="${e(p.name)}"><span>${ic('maximize')}</span></button><div class="sw-angle-meta"><span class="sw-tag ${p.kind==='ai-demo'?'ai':''}">${photoLabel(p)}</span><small title="${e(p.name)}">${e(p.name)}</small></div><div class="sw-angle-actions">${p.kind==='ai-demo'?`<button class="plain" data-inspect="${a.id}">${ic(p.accepted?'circle-check':'scan-eye')}${p.accepted?'重新查看':'查看并审核'}</button>`:`<label class="plain sw-upload">${ic('replace')}替换<input type="file" data-angle-upload="${a.id}" accept="image/jpeg,image/png,image/webp"></label>`}<button class="plain sw-danger" data-remove="${a.id}" aria-label="移除${a.name}">${ic('trash-2')}移除</button></div>`:`<label class="sw-empty-angle sw-upload">${ic('image-plus')}<b>上传${a.name}</b><small>${a.hint}</small><input type="file" data-angle-upload="${a.id}" accept="image/jpeg,image/png,image/webp"></label>`}</article>`;
  }
  // Studio: spots are the unit of work. Left: spot list with status; right: tabs for the selected spot; publish is global.
  const TABS=[['info','file-text','基本信息'],['photos','images','照片'],['guide','sparkles','导游'],['world','box','3D']];
  const ROAM_AXES=[['front','向前'],['back','向后'],['left','向左'],['right','向右'],['up','向上'],['down','向下']];
  function spotStatus(s){
    const photos=ANGLES.filter(a=>s.photos[a.id]).length,extras=Object.keys(s.photos).filter(isExtra).length,pending=Object.values(s.photos).filter(p=>p.kind==='ai-demo'&&!p.accepted).length;
    return {photos,extras,pending,photosDone:photos===ANGLES.length&&!pending,guide:Boolean(s.guide?.trim()),world:visitorExperience(s)==='world'||s.world?.kind==='demo'};
  }
  function chips(s){
    const st=spotStatus(s);
    return `<span class="st-chips"><span class="st-chip ${st.pending?'warn':st.photosDone?'ok':''}" title="照片">${ic('image')}${st.pending?st.pending+' 待审':st.photos+'/'+ANGLES.length}</span><span class="st-chip ${st.guide?'ok':''}" title="导游讲解">${ic('sparkles')}${st.guide?'讲解':'无讲解'}</span>${st.world?`<span class="st-chip ok" title="3D">${ic('box')}3D</span>`:''}</span>`;
  }
  function infoNote(text){return `<details class="st-note"><summary>${ic('info')}说明</summary><p>${text}</p></details>`;}
  function statusText(){
    const n=draftChanges(state).length;
    return saveError?`<span class="st-status bad">${ic('cloud-off')}本机保存失败</span>`:saving?`<span class="st-status">${ic('loader')}正在保存</span>`:n?`<span class="st-status warn">${ic('circle-dot')}${n} 处改动未发布</span>`:`<span class="st-status">${ic('circle-check')}已发布 v${state.publishNumber}</span>`;
  }
  function updateStatus(){const el=$('#st-status');if(el){el.innerHTML=statusText();hydrate();}const b=$('#open-publish');if(b)b.disabled=!draftChanges(state).length;}
  function studioHeader(){
    return `<header class="st-top"><a class="brand" href="#studio"><img src="/favicon.svg" alt=""><span>景见<small>STUDIO</small></span></a><input class="st-title" id="scenic-title" maxlength="60" value="${e(state.draft.title)}" aria-label="景区名称"><span id="st-status">${statusText()}</span><div class="st-top-actions"><a class="button small outline" href="#map" target="_blank" rel="noopener">${ic('eye')}预览游客端</a><button class="button small primary" id="open-publish" ${draftChanges(state).length?'':'disabled'}>${ic('send')}发布</button></div></header>`;
  }
  function studioSidebar(){
    return `<aside class="st-side"><button class="st-nav ${view==='map'?'active':''}" data-view="map">${ic('map')}景区地图<small>${state.draft.spots.length} 处</small></button><div class="st-side-label">景点</div><div class="st-spots">${state.draft.spots.map((s,i)=>`<button class="st-spot ${view==='spot'&&s.id===selected?'active':''}" data-spot="${e(s.id)}">${cover(s)?`<img loading="lazy" src="${e(webImageUrl(cover(s).url))}" alt="">`:`<span class="st-noimg">${ic('image')}</span>`}<span class="st-spot-text"><b>${String(i+1).padStart(2,'0')} · ${e(s.name)}</b>${chips(s)}</span></button>`).join('')}</div><button class="st-add" id="add-spot">${ic('plus')}添加景点</button><div class="st-side-foot"><button class="plain" id="export-scenic">${ic('download')}导出备份</button></div></aside>`;
  }
  function studioMap(){
    return `<div class="st-pane-head"><h1>景区地图</h1><div class="button-row">${imageInput('map-upload','更换地图')}<button class="button small ${placement==='add'?'primary':'outline'}" id="map-add">${ic('map-pin-plus')}${placement==='add'?'取消添加':'添加景点'}</button></div></div><p class="st-lead">${placement==='add'?'点击地图放置新景点。':'拖动点位调整位置，点一下打开该景点。选中点位后可用方向键微调。'}</p>${mapHTML(state.draft,true)}${infoNote('JPG / PNG / WebP，单张不超过 12 MB。点位按地图比例定位，更换地图后请核对位置。地图只是游览示意，不是地理坐标。')}`;
  }
  function studioSpot(){
    const s=spot();
    return `<div class="st-pane-head"><h1>${e(s.name)}</h1>${chips(s)}</div><nav class="st-tabs" role="tablist">${TABS.map(([id,i,name])=>`<button role="tab" aria-selected="${tab===id}" class="${tab===id?'active':''}" data-tab="${id}">${ic(i)}${name}</button>`).join('')}</nav><div class="st-tab-body">${tab==='info'?tabInfo(s):tab==='photos'?tabPhotos(s):tab==='guide'?tabGuide(s):tabWorld(s)}</div>`;
  }
  function tabInfo(s){
    return `<div class="st-form"><label>景点名称<input id="spot-name" maxlength="40" value="${e(s.name)}"></label><label>游客看到的介绍<textarea id="spot-description" rows="4" maxlength="500" placeholder="一两句话，说说这里值得停留的理由">${e(s.description)}</textarea></label><div class="button-row"><button class="button outline small" data-view="map">${ic('map-pin')}在地图上调整位置</button><button class="plain sw-danger" id="delete-spot">${ic('trash-2')}移除景点</button></div></div>`;
  }
  function tabPhotos(s){
    const st=spotStatus(s);
    return `<div class="st-bar"><span><b>${st.photos} / ${ANGLES.length}</b> 个视角${st.extras?' · 补充 '+st.extras+' 张':''}${st.pending?` · <em>${st.pending} 张 AI 图片待审核</em>`:''}</span><div class="button-row">${imageInput('batch-upload','批量上传',true)}${canCompleteDemo(s)&&pendingAngles(s).length?`<button class="button small primary" id="complete-angles">${ic('sparkles')}AI 补全缺失视角</button>`:''}</div></div>${busy==='completion'?`<div class="sw-job" role="status"><span class="sw-spinner"></span><div><b>正在准备补全视角…</b></div></div>`:''}<div class="sw-angles">${ANGLES.map(a=>photoCard(s,a)).join('')}</div><h3 class="st-sub">补充照片<small>不限数量，游客端排在六个视角之后</small></h3><div class="sw-angles">${Object.keys(s.photos).filter(isExtra).map(k=>photoCard(s,{id:k,name:'补充照片',hint:''})).join('')}<label class="sw-empty-angle sw-upload st-more">${ic('image-plus')}<b>添加照片</b><small>可多选</small><input type="file" id="more-upload" accept="image/jpeg,image/png,image/webp" multiple></label></div>${infoNote('AI 补全目前只对御碑亭原始实拍提供预生成样例，点击后模拟返回；其他景点请上传实拍。AI 图片需逐张打开、接受后才能发布。更换图片会让已生成的 3D 演示失效。')}`;
  }
  function tabGuide(s){
    return `<div class="sw-guide-editor"><section class="sw-guide-fields"><label>讲解资料<textarea id="guide-text" rows="10" maxlength="3000" placeholder="来历、看点、传说……每句话都应能被核实">${e(s.guide||'')}</textarea></label><label>运营提示<input id="guide-notice" maxlength="300" value="${e(s.notice||'')}" placeholder="例如：塔内电梯今日检修"></label><label>资料来源链接<input id="guide-source" type="url" maxlength="500" value="${e(s.factSource||'')}" placeholder="https://"></label></section><aside class="sw-guide-preview"><div class="sw-panel-caption"><span>试问导游 · 草稿</span></div>${guideHTML(s)}</aside></div>${infoNote('导游按句检索讲解资料，原样作答；问不到的问题会如实说明，不作推测。开放时间、票价等只看运营提示，未填写时提示以官方渠道为准。内置六处讲解为演示整理，正式使用前请景区核实。')}`;
  }
  function tabWorld(s){
    if(visitorExperience(s)==='world'){
      const r=roamOf(s);
      return `<div class="st-world"><section class="st-scene" id="st-scene"><div class="st-scene-top"><span id="st-scene-status" role="status">正在载入 3D 场景…</span><button class="sw-pilot-chip" id="st-scene-reset">${ic('rotate-ccw')}回到起点</button></div><span class="st-scene-hint">拖动环顾 · WASD 移动 · Q / E 升降</span></section><aside class="st-roam"><h3>可漫游范围</h3><p class="st-lead">游客只能在照片机位附近活动，超出部分多是模型推测。拖动滑块，左侧预览立即生效。</p>${ROAM_AXES.map(([k,label])=>`<label class="st-range">${label}<input type="range" min="0" max="5" step="0.1" value="${r[k]}" data-roam="${k}"><output id="roam-${k}">${r[k].toFixed(1)} m</output></label>`).join('')}<button class="plain" id="roam-reset">${ic('undo-2')}恢复默认范围</button><a class="plain" href="/assets/world/huagang-generation.json" target="_blank" rel="noopener">${ic('file-json')}生成记录</a></aside></div>${infoNote('这个 3D 场景由 Marble 1.1 以一张御碑亭正面实拍生成，未拍到的区域由模型推测；AI 补图没有参与本次生成。范围随发布快照一起更新到游客端。')}`;
    }
    const problem=confirmProblem(s);
    return `<div class="st-card"><h3>生成 3D 场景 · 演示</h3><div class="sw-check-item">${ic(pendingAngles(s).length?'circle':'circle-check')}<span>六个视角齐全<small>当前 ${Object.keys(s.photos).length} / ${ANGLES.length}</small></span></div><div class="sw-check-item">${ic(Object.values(s.photos).some(p=>p.kind==='ai-demo'&&!p.accepted)?'circle':'circle-check')}<span>AI 图片已全部审核</span></div>${busy==='world'?`<div class="sw-job" role="status"><span class="sw-spinner"></span><div><b>模拟生成中</b><p>${progress}%</p></div></div><progress value="${progress}" max="100" aria-label="模拟生成进度"></progress>`:s.world?.kind==='demo'?`<p class="st-lead">${ic('circle-check')} 演示任务已完成。这只验证流程，没有产生新的 3D 资产，游客端仍显示照片。</p>`:`<button class="button primary" id="generate-demo-world" ${problem?'disabled':''}>${ic('box')}确认素材并生成（演示）</button>${problem?`<p class="sw-hint">${e(problem)}</p>`:''}`}</div>${infoNote('这一步是模拟任务，不调用付费接口、不生成新资产。已接入的真实 3D 只有御碑亭。')}`;
  }
  function drawCreator(){
    if(view==='spot'&&!spot())view='map';
    if(!spot())selected=state.draft.spots[0]?.id;
    studioScene?.dispose();studioScene=null;
    host.innerHTML=`<div class="st-shell">${studioHeader()}<div class="st-body">${studioSidebar()}<main class="sw-work-main st-main">${saveError?`<p class="sw-save-error" role="alert">${e(saveError)}</p>`:''}<fieldset class="sw-fieldset" ${busy?'disabled':''}>${view==='map'?studioMap():studioSpot()}</fieldset></main></div></div>`;
    bindCreator();
  }
  const mapPoint=(ev,canvas)=>{const rect=canvas.getBoundingClientRect();return [Math.max(.03,Math.min(.97,(ev.clientX-rect.left)/rect.width)),Math.max(.05,Math.min(.92,(ev.clientY-rect.top)/rect.height))];};
  function bindEditMap(){
    const canvas=$('#scenic-map-canvas');
    canvas.onclick=guarded(async ev=>{
      if(placement!=='add'||ev.target.closest('[data-marker]'))return;
      const [x,y]=mapPoint(ev,canvas),s=newSpot(crypto.randomUUID(),x,y);s.name='新景点 '+(state.draft.spots.length+1);
      state.draft.spots.push(s);selected=s.id;placement='';view='spot';tab='info';await persist('已添加，先给它起个名字');
    });
    $$('[data-marker]').forEach(m=>{
      let start=null,moved=false;
      m.onpointerdown=ev=>{if(placement)return;start=[ev.clientX,ev.clientY];moved=false;m.setPointerCapture(ev.pointerId);};
      m.onpointermove=ev=>{if(!start)return;if(!moved&&Math.hypot(ev.clientX-start[0],ev.clientY-start[1])<4)return;moved=true;const [x,y]=mapPoint(ev,canvas);m.style.left=x*100+'%';m.style.top=y*100+'%';};
      m.onpointerup=guarded(async ev=>{if(!start)return;start=null;const s=state.draft.spots.find(x=>x.id===m.dataset.marker);if(!s)return;selected=s.id;
        if(moved){[s.x,s.y]=mapPoint(ev,canvas);await persist('位置已保存到草稿');}else{view='spot';tab='info';draw();}});
      m.onclick=ev=>ev.stopPropagation();
      m.onkeydown=guarded(async ev=>{const d={ArrowLeft:[-.005,0],ArrowRight:[.005,0],ArrowUp:[0,-.005],ArrowDown:[0,.005]}[ev.key];
        if(ev.key==='Enter'){selected=m.dataset.marker;view='spot';tab='info';draw();return;}if(!d)return;ev.preventDefault();const s=state.draft.spots.find(x=>x.id===m.dataset.marker);
        s.x=Math.max(.03,Math.min(.97,s.x+d[0]));s.y=Math.max(.05,Math.min(.92,s.y+d[1]));m.style.left=s.x*100+'%';m.style.top=s.y*100+'%';await persist('',false);});
    });
  }
  function bindMap(){
    $$('[data-marker]').forEach(b=>b.onclick=ev=>{ev.stopPropagation();selected=b.dataset.marker;history.replaceState(null,'','#map?id='+encodeURIComponent(selected));draw();$('[data-marker="'+CSS.escape(selected)+'"]')?.focus({preventScroll:true});$('#spot-card')?.scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});});
  }
  function showPublish(){
    const changes=draftChanges(state),problems=publishProblems(state.draft);
    const d=dialog(`<div class="sw-dialog-top"><span>发布到游客端</span><button class="plain" data-close aria-label="关闭">${ic('x')}</button></div><div class="sw-dialog-copy st-publish">${problems.length?`<h3>还有 ${problems.length} 项需要处理</h3><ul class="st-problems">${problems.map((p,i)=>`<li>${ic('circle-alert')}<span>${e(p.text)}</span>${p.spotId?`<button class="plain" data-fix="${i}">去处理 ${ic('arrow-right')}</button>`:''}</li>`).join('')}</ul>`:`<h3>这次会更新</h3><ul class="st-changes">${changes.map(c=>`<li>${ic('dot')}${e(c)}</li>`).join('')}</ul><label class="sw-check-label"><input type="checkbox" id="publish-rights">已核对图片使用权、AI 标记、讲解和介绍。</label><div class="button-row"><button class="button outline" data-close>再看看</button><button class="button primary" id="publish-map">${ic('send')}发布 v${state.publishNumber+1}</button></div><p class="sw-hint">发布只更新本浏览器的游客端；之后继续编辑草稿不会影响已发布内容。</p>`}</div>`);
    d.querySelectorAll('[data-fix]').forEach(b=>b.onclick=()=>{const p=problems[b.dataset.fix];selected=p.spotId;view='spot';tab=p.tab;d.close();draw();});
    const go=d.querySelector('#publish-map');
    if(go)go.onclick=guarded(async()=>{if(!d.querySelector('#publish-rights').checked)throw Error('请先勾选核对项');const next=copy(state);publishScenic(next);await saveScenic(next);state=next;d.close();draw();notify('已发布 v'+state.publishNumber+'，游客端已更新');});
  }
  function bindCreator(){
    const nav=fn=>()=>{if(busy)return;placement='';fn();draw();};
    $$('[data-view]').forEach(b=>b.onclick=nav(()=>{view=b.dataset.view;}));
    $$('[data-spot]').forEach(b=>b.onclick=nav(()=>{selected=b.dataset.spot;view='spot';}));
    $$('[data-tab]').forEach(b=>b.onclick=nav(()=>{tab=b.dataset.tab;}));
    $('#add-spot').onclick=()=>{if(busy)return;view='map';placement='add';draw();};
    $('#open-publish').onclick=()=>showPublish();
    $('#export-scenic').onclick=guarded(async()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({format:'jingjian-scenic-backup',exportedAt:new Date().toISOString(),state:await exportState(state)},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='景见-地图与多视角备份.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);});
    $('#scenic-title').onchange=guarded(async ev=>{const value=ev.target.value.trim();if(!value){ev.target.value=state.draft.title;throw Error('景区名称不能为空');}state.draft.title=value;await persist();});
    if(view==='map'){
      bindEditMap();
      $('#map-upload').onchange=guarded(async ev=>{const f=ev.target.files[0];if(!f)return;const image=await imageFile(f);state.draft.map={url:image.url,name:image.name,custom:true};await persist('地图已替换，请核对每个景点的位置');});
      $('#map-add').onclick=()=>{placement=placement==='add'?'':'add';draw();};
      return;
    }
    const s=spot();
    if(tab==='info'){
      $('#spot-name').onchange=guarded(async ev=>{const value=ev.target.value.trim();if(!value){ev.target.value=s.name;throw Error('景点名称不能为空');}s.name=value;await persist();});
      $('#spot-description').onchange=guarded(async ev=>{s.description=ev.target.value;await persist();});
      $('#delete-spot').onclick=()=>showDelete();
    }
    if(tab==='photos'){
      $$('[data-angle-upload]').forEach(input=>input.onchange=guarded(async ev=>{const f=ev.target.files[0];if(!f)return;putPhoto(s,input.dataset.angleUpload,await imageFile(f));await persist('图片已加入草稿');}));
      $('#batch-upload').onchange=guarded(async ev=>{const files=[...ev.target.files],missing=pendingAngles(s);if(!files.length)return;const photos=await Promise.all(files.map(imageFile));photos.forEach((p,i)=>putPhoto(s,missing[i]?.id||extraId(),p));await persist(photos.length>missing.length?'已填满空缺视角，其余 '+(photos.length-missing.length)+' 张作为补充照片':'已按空缺视角顺序导入，请核对图片对应关系');});
      $('#more-upload').onchange=guarded(async ev=>{const files=[...ev.target.files];if(!files.length)return;const photos=await Promise.all(files.map(imageFile));for(const p of photos)putPhoto(s,extraId(),p);await persist('已添加 '+photos.length+' 张补充照片');});
      $$('[data-remove]').forEach(b=>b.onclick=guarded(async()=>{removePhoto(s,b.dataset.remove);await persist();}));
      $$('[data-inspect]').forEach(b=>b.onclick=()=>showImage(s,b.dataset.inspect,true));
      $('#complete-angles')?.addEventListener('click',guarded(()=>runCompletion()));
    }
    if(tab==='guide'){
      bindGuide(s);
      $('#guide-text').onchange=guarded(async ev=>{s.guide=ev.target.value.trim();guideFor='';await persist('讲解资料已保存到草稿');});
      $('#guide-notice').onchange=guarded(async ev=>{s.notice=ev.target.value.trim();await persist();});
      $('#guide-source').onchange=guarded(async ev=>{const v=ev.target.value.trim();if(v&&!safeURL(v)){ev.target.value=s.factSource||'';throw Error('请填写 http 或 https 链接');}s.factSource=v?safeURL(v):'';await persist();});
    }
    if(tab==='world'){
      $('#generate-demo-world')?.addEventListener('click',guarded(async()=>{confirmSpot(s);await persist('',false);runWorld();}));
      if(visitorExperience(s)!=='world')return;
      const status=$('#st-scene-status');
      studioScene=mountPilotScene($('#st-scene'),{roam:s.roam,
        onStatus:v=>{status.textContent=v==='splat'?'预览中 · 与游客端范围一致':v==='error'?'3D 场景未能载入':'正在载入 3D 场景…';},
        onPosition:({distance,edge})=>{status.textContent=(edge?'已到范围边缘':'预览中')+' · 距起点 '+distance.toFixed(1)+' m';}});
      studioScene.ready.then(v=>{if(v)$('#st-scene-reset').onclick=()=>v.reset();});
      $$('[data-roam]').forEach(input=>{
        input.oninput=()=>{s.roam={...roamOf(s),[input.dataset.roam]:Number(input.value)};studioScene?.setRoam(s.roam);$('#roam-'+input.dataset.roam).textContent=Number(input.value).toFixed(1)+' m';};
        input.onchange=guarded(()=>persist('',false));
      });
      $('#roam-reset').onclick=guarded(async()=>{delete s.roam;await persist('已恢复默认范围');});
    }
  }
  function dialog(html){
    galleryDialog?.remove();galleryDialog=document.createElement('dialog');galleryDialog.className='sw-dialog';galleryDialog.innerHTML=html;document.body.appendChild(galleryDialog);galleryDialog.showModal();hydrate();
    galleryDialog.addEventListener('click',ev=>{if(ev.target===galleryDialog)galleryDialog.close();});
    galleryDialog.addEventListener('close',()=>{galleryDialog?.remove();galleryDialog=null;},{once:true});
    galleryDialog.querySelector('[data-close]')?.addEventListener('click',()=>galleryDialog.close());return galleryDialog;
  }
  function showDelete(){
    const s=spot();const d=dialog(`<div class="sw-dialog-copy"><h2>移除「${e(s.name)}」？</h2><p>此操作会移除草稿中的点位和素材；当前游客预览保持原样，直到下一次发布。</p><div class="button-row"><button class="button outline" data-close>保留景点</button><button class="button primary" id="remove-confirmed">确认移除</button></div></div>`);
    d.querySelector('#remove-confirmed').onclick=async()=>{state.draft.spots=state.draft.spots.filter(x=>x.id!==s.id);selected=state.draft.spots[0]?.id;view='map';d.close();await persist('已从草稿移除');};
  }
  function showImage(s,angle,review){
    const p=s.photos[angle],a={name:photoName(angle)};if(!p)return;
    const d=dialog(`<div class="sw-dialog-top"><span>${e(s.name)} / ${a.name}</span><button class="plain" data-close aria-label="关闭图片预览">${ic('x')}</button></div><img class="sw-dialog-image" src="${e(webImageUrl(p.url))}" alt="${e(p.name)}"><div class="sw-dialog-copy"><span class="sw-tag ${p.kind==='ai-demo'?'ai':''}">${photoLabel(p)}</span><p>${p.kind==='ai-demo'?'这是预生成的御碑亭补全样片。请对照正面实拍检查屋顶、石柱、碑体与环境关系；背面和俯视包含不可见区域的推测，画面合理并不代表真实准确。':p.kind==='upload'?'景区上传素材，请核对位置、视角与使用权。':'演示参考素材，不作为真实景区测绘依据。'}</p>${creditHTML(p)}${review&&p.kind==='ai-demo'?`<div class="button-row"><button class="button outline" id="reject-image">移除此图，重新准备</button><button class="button primary" id="accept-image">${ic('check')}${p.accepted?'保留已接受状态':'接受这张示例补全图'}</button></div>`:''}</div>`);
    if(review&&p.kind==='ai-demo'){
      d.querySelector('#accept-image').onclick=async()=>{p.accepted=true;d.close();await persist('已接受该视角');};
      d.querySelector('#reject-image').onclick=async()=>{removePhoto(s,angle);d.close();await persist('已移除，请上传替代图片或再次补全');};
    }
  }
  async function runCompletion(){
    const s=spot();busy='completion';draw();
    try{await new Promise(resolve=>{jobTimer=setTimeout(resolve,1400);});if(!alive)return;completeDemo(s);await persist('示例补全已准备好，请逐张打开审核',false);}catch(err){notify(err.message);}finally{busy='';if(alive)draw();}
  }
  function runWorld(){
    const s=spot(),revision=s.revision;if(s.confirmedRevision!==revision)throw Error('请先确认素材');busy='world';progress=0;draw();
    jobTimer=setInterval(async()=>{if(!alive){clearInterval(jobTimer);return;}progress=Math.min(100,progress+20);if(progress<100){draw();return;}clearInterval(jobTimer);try{createDemoWorld(s,revision);await persist('模拟生成完成；没有消耗世界模型额度',false);}catch(err){notify(err.message);}finally{busy='';if(alive)draw();}},650);
  }
  function draw(){if(!alive||!state)return;if(isCreator)drawCreator();else drawVisitor();hydrate();}
  host.innerHTML=frame(`<main class="page sw-empty" role="status">正在打开景区…</main>`);
  loadScenic().then(value=>{if(alive){state=value;draw();}}).catch(err=>notify(err.message));
  return ()=>{alive=false;clearTimeout(jobTimer);clearInterval(jobTimer);galleryDialog?.remove();studioScene?.dispose();};
}
