import {webImageUrl} from './web-images.js';
import {escapeHTML as e,safeURL} from './core.js';
import {ANGLES,copy,newSpot,newScenic,putPhoto,removePhoto,pendingAngles,completeDemo,publishScenic,visitorExperience,canCompleteDemo,answerSpot,draftChanges,publishProblems,roamOf,isExtra,extraId,photoName,orderedPhotos,worldAsset,worldInputs,worldProblem,worldStale,applyGeneratedWorld,WORLD_ANGLES,WORLD_MODELS,modelOf,REF} from './scenic-core.js';
import {loadScenic,saveScenic,imageFile,exportState} from './scenic-store.js';
import {mountPilotScene} from './pilot-world.js';
import {HELPERS,SOURCE_LABEL,runGeo,runScript,runTrip,runQA,tripOf,untraced,helperInput} from './scenic-agents.js';
import {geoFor} from './geo-registry.js';
import {tripCardHTML} from './trip-card.js';
import {bindSpeak,stopSpeaking} from './narration.js';
import './scenic.css';

const ic=name=>`<i data-lucide="${name}"></i>`;
const photoLabel=p=>p.kind==='real'?'实景摄影':p.kind==='ai-demo'?'AI 补全 · 示例':p.kind==='concept'?'AI 概念图':p.kind==='reference'?'参考照片':'景区上传';
const cover=s=>s.photos.front||Object.values(s.photos)[0];
const creditHTML=p=>p?.credit?`<div class="sw-attribution"><span>${e(p.credit.artist)} · ${e(p.credit.date?.split(' ')[0]||'')}</span><span><a href="${e(p.credit.source)}" target="_blank" rel="noopener noreferrer">原照片与作者</a> · <a href="${e(p.credit.licenseUrl)}" target="_blank" rel="noopener noreferrer">${e(p.credit.license)}</a></span><small>${e(p.credit.changes)}</small></div>`:'';
const imageInput=(id,label,multiple=false)=>`<label class="button outline small sw-upload">${ic('upload')}${label}<input id="${id}" type="file" accept="image/jpeg,image/png,image/webp" ${multiple?'multiple':''}></label>`;

export function mountScenic(host,{mode,hydrate,toast}) {
  const params=new URLSearchParams(location.hash.split('?')[1]),sid=params.get('s')||(mode==='studio'?'':'westlake');
  let alive=true, ws, state, selected=(mode==='map'&&params.get('id'))||'huagang', view='map', tab='info', studioScene=null, placement='', busy='', progress=0, saveError='', saving=false, activeAngle='front', jobTimer;
  let galleryDialog,guideFor='',guideLog=[];
  // What the local server can do; the public static site has no /api and gets {}.
  let caps={},worldModel='',pollTimer,ticker;const submitting=new Set();
  const $=s=>host.querySelector(s), $$=s=>[...host.querySelectorAll(s)];
  const isCreator=mode==='studio';
  const link=(route,id)=>'#'+route+'?s='+encodeURIComponent(sid)+(id?'&id='+encodeURIComponent(id):''),spotLink=s=>link('spot',s.id);
  const spot=()=>state.draft.spots.find(s=>s.id===selected);
  const notify=message=>{if(alive)toast(message);};
  function frame(body){
    if(!isCreator)return `<header class="header sw-header sw-visitor-header"><a class="brand" href="#home"><img src="/favicon.svg" alt=""><span>景见<small>JINGJIAN</small></span></a></header>${body}`;
    return `<header class="st-top"><a class="brand" href="#studio"><img src="/favicon.svg" alt=""><span>景见<small>STUDIO</small></span></a></header>${body}`;
  }
  async function persist(message,redraw=true){
    saving=true;
    try{await saveScenic(ws);saveError='';if(message)notify(message);}catch{saveError='本机保存失败。请立即导出备份，刷新可能丢失本次修改。';notify(saveError);}finally{saving=false;}
    if(!alive)return;if(redraw)draw();else updateStatus();
  }
  function guarded(action){return async ev=>{try{if(!busy)await action(ev);}catch(err){notify(err.message);}};}
  function mapHTML(project,edit=false){
    return `<div class="sw-map-shell ${edit?'sw-edit-map':''} ${!edit&&project.spots.length>8?'sw-dense-map':''}"><div class="sw-map-canvas ${placement?'is-placing':''}" id="scenic-map-canvas"><img class="sw-map-image" src="${e(webImageUrl(project.map.url))}" alt="${e(project.map.name)}" draggable="false">${project.spots.map((s,i)=>`<button class="sw-marker ${selected===s.id?'selected':''}" style="left:${s.x*100}%;top:${s.y*100}%" data-marker="${e(s.id)}" aria-label="选择景点：${e(s.name)}" aria-pressed="${selected===s.id}"><span>${String(i+1).padStart(2,'0')}</span><b>${e(s.name)}</b></button>`).join('')}</div><div class="sw-map-legend"><span>${ic('map')} ${project.map.custom?'景区上传地图':e(project.map.legend||'插画依西湖湖岸构图 · 点位为示意')}</span><span>${edit?(placement==='add'?'点击地图放置新景点':placement==='move'?'点击地图设置新位置':'选择点位进行编辑'):''}</span></div>${!edit&&project.spots.length>8?`<nav class="sw-map-index" aria-label="景点目录">${project.spots.map((s,i)=>`<button data-marker="${e(s.id)}" aria-pressed="${selected===s.id}"><span>${String(i+1).padStart(2,'0')}</span>${e(s.name)}</button>`).join('')}</nav>`:''}</div>`;
  }
  function drawVisitor(){
    if(mode==='list')return drawList();
    if(!state?.published){host.innerHTML=frame(`<main class="page sw-empty"><h1>这个景区暂时没有开放预览</h1><p>看看其他景区。</p><a class="button primary" href="#scenics">全部景区</a></main>`);return;}
    const p=state.published;
    if(!p.spots.some(s=>s.id===selected))selected=p.spots[0]?.id;
    if(mode==='spot')return drawDetail();
    if(mode==='trip')return drawTrip();
    const s=p.spots.find(x=>x.id===selected),img=s&&cover(s);
    // One map, one preview card: tapping a pin previews it in place instead of leaving the page.
    const card=s?`<aside class="sw-spot-card" id="spot-card" aria-label="景点预览">${img?`<div class="sw-spot-cover"><img src="${e(webImageUrl(img.url))}" alt=""><span class="sw-tag${['ai-demo','concept'].includes(img.kind)?' ai':''}">${photoLabel(img)}</span></div>`:''}<div class="sw-spot-body"><span class="sw-spot-kind">${ic(visitorExperience(s)==='world'?'box':'images')}${visitorExperience(s)==='world'?'可 3D 漫游':'图片赏景'}</span><h2>${e(s.name)}</h2><p>${e(s.description||'沿着自己的节奏，发现这里的风景。')}</p><div class="sw-spot-actions">${visitorExperience(s)==='world'?`<a class="button primary" href="${link('pilot',s.id)}">${ic('box')}进入 3D 漫游</a><a class="button outline" href="${spotLink(s)}">${ic('images')}看照片</a>`:`<a class="button primary" href="${spotLink(s)}">${ic('images')}看照片</a>`}</div></div></aside>`:'';
    host.innerHTML=frame(`<main class="sw-visitor page"><div class="sw-visitor-heading"><div><a class="sw-back" href="#scenics">${ic('arrow-left')}全部景区</a><h1>${e(p.title)}</h1><p>点击地图上的景点，看看那里的风景。</p></div>${geoFor(sid)?`<a class="button outline small" href="${link('map')}">${ic('box')}微缩 3D</a>`:''}</div><div class="sw-explore-layout">${mapHTML(p)}${card}</div></main>`);
    bindMap();
  }
  // Visitor home: every published scenic area, then its map.
  function drawList(){
    const list=ws.scenics.filter(x=>x.published);
    const card=sc=>{const p=sc.published,n3=p.spots.filter(s=>visitorExperience(s)==='world').length;return `<a class="sj-card sj-link" href="#map?s=${encodeURIComponent(sc.id)}"><div class="sj-cover"><img src="${e(webImageUrl(p.map.url))}" alt="" loading="lazy"></div><div class="sj-body"><h2>${e(p.title)}</h2>${p.intro?`<p>${e(p.intro)}</p>`:''}<div class="sj-meta"><span>${ic('map-pin')}${p.spots.length} 处景点</span>${n3?`<span>${ic('box')}${n3} 处可 3D 漫游</span>`:''}</div></div></a>`;};
    host.innerHTML=frame(`<main class="sj-page"><div class="sj-head"><h1>去哪里看看</h1><p>选一个景区，在地图上挑想去的地方。</p></div>${list.length?`<div class="sj-grid">${list.map(card).join('')}</div>`:'<p class="sj-empty">暂时还没有开放的景区。</p>'}</main>`);
  }
  function drawDetail(){
    const id=new URLSearchParams(location.hash.split('?')[1]).get('id');
    const p=state.published,s=p.spots.find(x=>x.id===id);
    if(!s){host.innerHTML=frame(`<main class="page sw-empty"><h1>这个景点暂时没有开放预览</h1><p>回到地图，发现其他风景。</p><a class="button primary" href="${link('map')}">回到景区地图</a></main>`);return;}
    const photos=orderedPhotos(s);if(!s.photos[activeAngle])activeAngle=photos[0]?.[0];const shown=s.photos[activeAngle];
    const index=p.spots.indexOf(s),next=p.spots.length>1?p.spots[(index+1)%p.spots.length]:null;
    const hasAI=Object.values(s.photos).some(x=>['ai-demo','concept'].includes(x.kind));
    host.innerHTML=frame(`<main class="sw-detail page"><a class="sw-back" href="${link('map',s.id)}">${ic('arrow-left')}回到地图</a><div class="sw-detail-layout"><section><div class="sw-photo-stage"><img src="${e(webImageUrl(shown?.url))}" alt="${e(s.name)} · ${e(photoName(activeAngle))}"><span class="sw-photo-credit">${shown?photoLabel(shown):''}</span>${photos.length>1?`<span class="sw-photo-count">${photos.findIndex(([id])=>id===activeAngle)+1} / ${photos.length}</span>`:''}<button class="sw-expand" id="visitor-enlarge" aria-label="放大当前图片">${ic('maximize')}</button></div>${photos.length>1?`<div class="sw-thumbnails">${photos.map(([id,x])=>`<button data-gallery="${id}" class="${id===activeAngle?'active':''}" aria-label="查看${e(photoName(id))}" aria-pressed="${id===activeAngle}"><img src="${e(webImageUrl(x.url))}" alt=""><span>${e(photoName(id))}</span></button>`).join('')}</div>`:''}${creditHTML(shown)}</section><aside class="sw-story"><h1>${e(s.name)}</h1><p>${e(s.description||'沿着自己的节奏，发现这里的风景。')}</p>${s.narration?.text?`<div class="sw-narration"><button class="button outline full" id="listen">${ic('volume-2')}<span>听讲解</span></button><details><summary>讲解稿 · 景区按资料整理</summary><p>${e(s.narration.text)}</p></details></div>`:''}${visitorExperience(s)==='world'?`<a class="button primary large full" href="${link('pilot',s.id)}">${ic('box')}进入 3D 漫游</a><small class="sw-quiet">${e(worldAsset(s).note)}</small>`:''}${guideHTML(s)}<details class="sw-sources"><summary>${ic('info')}关于图片与资料</summary>${safeURL(s.factSource)?`<a class="sw-text-link" href="${e(safeURL(s.factSource))}" target="_blank" rel="noopener noreferrer">景点资料来源</a>`:''}<p>${hasAI?'本页包含 AI 概念或补全图像，用于呈现游览氛围；未拍摄部分为推测，实际景观请以现场为准。':'图片用于景观参考；地图为游览示意，实际位置与开放情况请以景区信息为准。'}</p></details>${next?`<a class="sw-next" href="${spotLink(next)}"><span><small>下一处</small>${e(next.name)}</span>${ic('arrow-right')}</a>`:''}</aside></div></main>`);
    $$('[data-gallery]').forEach(b=>b.onclick=()=>{activeAngle=b.dataset.gallery;draw();});
    $('#visitor-enlarge').onclick=()=>showImage(s,activeAngle,false);
    bindGuide(s);bindSpeak($('#listen'),s.narration?.text);
    if(new URLSearchParams(location.hash.split('?')[1]).get('guide'))setTimeout(()=>{const g=$('.sw-guide');if(!g)return;g.scrollIntoView({behavior:'smooth',block:'center'});g.classList.add('sw-flash');$('#guide-q')?.focus({preventScroll:true});},80);
  }
  // Itinerary card: the visitor page shows it inside a mock itinerary; &embed=1 is the bare card for an iframe.
  function drawTrip(){
    const p=state.published,trip=p.trip,embed=params.get('embed')==='1';
    if(!trip){host.innerHTML=embed?'':frame(`<main class="page sw-empty"><h1>这个景区还没有发布游览路线</h1><p>先在地图上挑想去的地方。</p><a class="button primary" href="${link('map')}">回到景区地图</a></main>`);return;}
    const card=tripCardHTML(trip,p.spots,{G:geoFor(sid),embed,link:s=>visitorExperience(s)==='world'?link('pilot',s.id):spotLink(s)});
    if(embed){host.innerHTML=card;return;}
    const src=location.origin+location.pathname+'#trip?s='+encodeURIComponent(sid)+'&embed=1';
    host.innerHTML=frame(`<main class="page tc-page"><a class="sw-back" href="${link('map')}">${ic('arrow-left')}回到景区地图</a><div class="tc-intro"><h1>游览路线卡片</h1><p>一张可以放进行程单、酒店或美食页面的路线卡片。下面是它放进行程单里的样子。</p></div><div class="tc-host"><div class="tc-host-bar"><b>我的行程</b><span>第 1 天 · 杭州</span><em>嵌入示意</em></div>${card}</div><details class="tc-code"><summary>${ic('code')}嵌入代码</summary><code>${e(`<iframe src="${src}" width="420" height="720" style="border:0"></iframe>`)}</code></details></main>`);
  }
  // One guide widget for visitors and the studio preview. With the local server it asks Claude, grounded in spot.guide / spot.notice;
  // otherwise (or on any failure) it falls back to sentence retrieval from the same material.
  function guideHTML(s){
    if(guideFor!==s.id){guideFor=s.id;guideLog=[];}
    return `<section class="sw-guide" aria-label="AI 导游"><div class="sw-guide-head">${ic('sparkles')}<b>问问导游</b><small>只依据景区讲解资料回答</small></div><div class="sw-guide-log" id="guide-log" aria-live="polite">${guideLogHTML()}</div><div class="sw-guide-chips">${['讲讲这里','名字怎么来的','有什么提示','今天几点开放'].map(q=>`<button type="button" data-guide-q="${q}">${q}</button>`).join('')}</div><form class="sw-guide-form" id="guide-form"><input id="guide-q" maxlength="200" autocomplete="off" placeholder="关于${e(s.name)}，你想知道…" aria-label="向导游提问"><button type="submit" aria-label="发送">${ic('arrow-up')}</button></form></section>`;
  }
  const answerLabel=m=>m.known?(m.mode==='llm'?'AI 导游 · 依据景区讲解资料':'摘自景区讲解资料'):'资料中没有 · 不作推测';
  function guideLogHTML(){
    return guideLog.length?guideLog.map(m=>m.role==='user'?`<p class="sw-guide-q">${e(m.text)}</p>`:m.pending?`<div class="sw-guide-a is-pending"><p><span class="sw-typing" aria-label="导游正在回答"><i></i><i></i><i></i></span></p></div>`:`<div class="sw-guide-a"><p>${e(m.text)}</p><small>${answerLabel(m)}</small></div>`).join(''):'<p class="sw-guide-empty">点一个问题，或者直接问。</p>';
  }
  async function guideAnswer(s,q,history){
    if(caps.guide)try{
      const r=await fetch('/api/guide',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:s.name,guide:s.guide||s.description||'',notice:s.notice||'',question:q,history}),signal:AbortSignal.timeout(35000)});
      if(r.ok)return await r.json();
    }catch{}
    return answerSpot(s,q);
  }
  function bindGuide(s){
    const render=()=>{const log=$('#guide-log');if(!log)return;log.innerHTML=guideLogHTML();log.scrollTop=log.scrollHeight;};
    const ask=async q=>{
      q=q.trim();if(!q||guideLog.some(m=>m.pending))return;
      const history=guideLog.map(m=>({role:m.role==='user'?'user':'assistant',text:m.text}));
      const reply={role:'guide',pending:true,text:''},log=guideLog;
      guideLog.push({role:'user',text:q},reply);render();
      Object.assign(reply,await guideAnswer(s,q,history),{pending:false});
      if(!alive||guideLog!==log)return;// The visitor moved on to another spot.
      if(guideLog.length>12)guideLog.splice(0,guideLog.length-12);render();
    };
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
    return {photos,extras,pending,photosDone:photos===ANGLES.length&&!pending,guide:Boolean(s.guide?.trim()),world:Boolean(worldAsset(s)),stale:worldStale(s),job:['uploading','running'].includes(state.jobs?.[s.id]?.status)};
  }
  function chips(s){
    const st=spotStatus(s);
    return `<span class="st-chips"><span class="st-chip ${st.pending?'warn':st.photosDone?'ok':''}" title="照片">${ic('image')}${st.pending?st.pending+' 待审':st.photos+'/'+ANGLES.length}</span><span class="st-chip ${st.guide?'ok':''}" title="导游讲解">${ic('sparkles')}${st.guide?'讲解':'无讲解'}</span>${st.job?`<span class="st-chip warn" title="3D 生成中">${ic('loader')}生成中</span>`:st.world?`<span class="st-chip ${st.stale?'warn':'ok'}" title="${st.stale?'照片已变化，可重新生成':'3D'}">${ic('box')}3D</span>`:''}</span>`;
  }
  function infoNote(text){return `<details class="st-note"><summary>${ic('info')}说明</summary><p>${text}</p></details>`;}
  function statusText(){
    const n=draftChanges(state).length;
    return saveError?`<span class="st-status bad">${ic('cloud-off')}本机保存失败</span>`:saving?`<span class="st-status">${ic('loader')}正在保存</span>`:!state.published?`<span class="st-status warn">${ic('circle-dot')}未发布</span>`:n?`<span class="st-status warn">${ic('circle-dot')}${n} 处改动未发布</span>`:`<span class="st-status">${ic('circle-check')}已发布 v${state.publishNumber}</span>`;
  }
  function updateStatus(){const el=$('#st-status');if(el){el.innerHTML=statusText();hydrate();}const b=$('#open-publish');if(b)b.disabled=!draftChanges(state).length;}
  function studioHeader(){
    return `<header class="st-top"><a class="brand" href="#studio"><img src="/favicon.svg" alt=""><span>景见<small>STUDIO</small></span></a><input class="st-title" id="scenic-title" maxlength="60" value="${e(state.draft.title)}" aria-label="景区名称"><span id="st-status">${statusText()}</span><div class="st-top-actions"><a class="button small outline" href="${link('map')}" target="_blank" rel="noopener">${ic('eye')}预览游客端</a><button class="button small primary" id="open-publish" ${draftChanges(state).length?'':'disabled'}>${ic('send')}发布</button></div></header>`;
  }
  function studioSidebar(){
    return `<aside class="st-side"><a class="st-nav st-back" href="#studio">${ic('arrow-left')}全部景区</a><button class="st-nav ${view==='map'?'active':''}" data-view="map">${ic('map')}景区地图<small>${state.draft.spots.length} 处</small></button><button class="st-nav ${view==='make'?'active':''}" data-view="make">${ic('wand-sparkles')}制作助手<small>${(q=>q.block+q.warn?q.block+q.warn+' 项待处理':'')(runQA(state.draft,geoFor(state.id)))}</small></button><div class="st-side-label">景点</div><div class="st-spots">${state.draft.spots.map((s,i)=>`<button class="st-spot ${view==='spot'&&s.id===selected?'active':''}" data-spot="${e(s.id)}">${cover(s)?`<img loading="lazy" src="${e(webImageUrl(cover(s).url))}" alt="">`:`<span class="st-noimg">${ic('image')}</span>`}<span class="st-spot-text"><b>${String(i+1).padStart(2,'0')} · ${e(s.name)}</b>${chips(s)}</span></button>`).join('')}</div><button class="st-add" id="add-spot">${ic('plus')}添加景点</button><div class="st-side-foot"><button class="plain" id="export-scenic">${ic('download')}导出备份</button></div></aside>`;
  }
  function studioMap(){
    return `<div class="st-pane-head"><h1>景区地图</h1><div class="button-row">${imageInput('map-upload','更换地图')}<button class="button small ${placement==='add'?'primary':'outline'}" id="map-add">${ic('map-pin-plus')}${placement==='add'?'取消添加':'添加景点'}</button></div></div><label class="st-intro">景区介绍 · 显示在游客端景区列表<input id="scenic-intro" maxlength="120" value="${e(state.draft.intro||'')}" placeholder="一句话介绍这个景区"></label><p class="st-lead">${placement==='add'?'点击地图放置新景点。':state.draft.spots.length?'拖动点位调整位置，点一下打开该景点。选中点位后可用方向键微调。':'点「添加景点」，在地图上放下第一个景点。'}</p>${mapHTML(state.draft,true)}${infoNote('JPG / PNG / WebP，单张不超过 12 MB。点位按地图比例定位，更换地图后请核对位置。地图只是游览示意，不是地理坐标。')}`;
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
    return `<div class="st-bar"><span><b>${st.photos} / ${ANGLES.length}</b> 个视角${st.extras?' · 补充 '+st.extras+' 张':''}${st.pending?` · <em>${st.pending} 张 AI 图片待审核</em>`:''}</span><div class="button-row">${imageInput('batch-upload','批量上传',true)}${canCompleteDemo(s)&&pendingAngles(s).length?`<button class="button small primary" id="complete-angles">${ic('sparkles')}AI 补全缺失视角</button>`:''}</div></div>${busy==='completion'?`<div class="sw-job" role="status"><span class="sw-spinner"></span><div><b>正在准备补全视角…</b></div></div>`:''}<div class="sw-angles">${ANGLES.map(a=>photoCard(s,a)).join('')}</div><h3 class="st-sub">补充照片<small>不限数量，游客端排在六个视角之后</small></h3><div class="sw-angles">${Object.keys(s.photos).filter(isExtra).map(k=>photoCard(s,{id:k,name:'补充照片',hint:''})).join('')}<label class="sw-empty-angle sw-upload st-more">${ic('image-plus')}<b>添加照片</b><small>可多选</small><input type="file" id="more-upload" accept="image/jpeg,image/png,image/webp" multiple></label></div>${infoNote('AI 补全目前只对御碑亭原始实拍提供预生成样例，点击后模拟返回；其他景点请上传实拍。AI 图片需逐张打开、接受后才能发布和送入 3D 生成。更换正面、两侧或背面照片后，3D 标签会提示重新生成。')}`;
  }
  function tabGuide(s){
    return `<div class="sw-guide-editor"><section class="sw-guide-fields"><label>讲解资料<textarea id="guide-text" rows="10" maxlength="3000" placeholder="来历、看点、传说……每句话都应能被核实">${e(s.guide||'')}</textarea></label><label>运营提示<input id="guide-notice" maxlength="300" value="${e(s.notice||'')}" placeholder="例如：塔内电梯今日检修"></label><label>资料来源链接<input id="guide-source" type="url" maxlength="500" value="${e(s.factSource||'')}" placeholder="https://"></label></section><aside class="sw-guide-preview"><div class="sw-panel-caption"><span>试问导游 · 草稿</span></div>${guideHTML(s)}</aside></div>${infoNote('导游按句检索讲解资料，原样作答；问不到的问题会如实说明，不作推测。开放时间、票价等只看运营提示，未填写时提示以官方渠道为准。内置六处讲解为演示整理，正式使用前请景区核实。')}`;
  }
  // 3D tab: live preview on the left; on the right, what goes in, which model, and the running job.
  const DIRECTION={front:'正面',rear:'右侧',back:'背面',left:'左侧'};
  const STEPS=['上传照片','生成 3D 场景','下载到本机'];
  const elapsed=job=>{const t=Math.max(0,Math.round((Date.now()-Date.parse(job.startedAt))/1000));return Math.floor(t/60)+':'+String(t%60).padStart(2,'0');};
  const modelFor=s=>worldModel||(s.world?.model==='marble-1.0-draft'?'marble-1.1':'marble-1.0-draft');
  function jobHTML(job){
    if(['failed','uncertain'].includes(job.status))return `<div class="st-job bad" id="st-job" role="alert"><b>${ic('circle-alert')}${job.status==='uncertain'?'提交结果不确定':'生成没有完成'}</b><p>${e(job.error||'请稍后重试。')}</p><div class="button-row"><button class="button small outline" id="job-dismiss">${job.status==='uncertain'?'我已核对，关闭':'关闭'}</button></div></div>`;
    const at=job.status==='uploading'?0:/download|SUCCEEDED/i.test(job.stage)?2:1;
    return `<div class="st-job" id="st-job" role="status"><div class="st-job-head"><span class="sw-spinner"></span><b>${e(modelOf(job.model)?.name||job.model)} · 生成中</b><span class="st-job-time" id="st-job-time">${elapsed(job)}</span></div><ol class="st-steps">${STEPS.map((t,i)=>`<li class="${i<at?'done':i===at?'now':''}">${ic(i<at?'circle-check':i===at?'loader':'circle')}${t}</li>`).join('')}</ol><p class="sw-hint">${e(job.progress||(at===0?'正在把照片发送到 World Labs…':'World Labs 正在生成，可以先去编辑别的内容，完成后会提示。'))}</p></div>`;
  }
  function tabWorld(s){
    const asset=worldAsset(s),job=state.jobs?.[s.id],active=['uploading','running'].includes(job?.status),inputs=worldInputs(s),problem=worldProblem(s),stale=worldStale(s),model=modelFor(s);
    const pendingAI=WORLD_ANGLES.filter(a=>s.photos[a]?.kind==='ai-demo'&&!s.photos[a].accepted);
    const slot=a=>{const p=s.photos[a],used=inputs.some(i=>i.angle===a);return `<li class="st-input ${used?'':'off'}">${p?`<img src="${e(webImageUrl(p.url))}" alt="">`:`<span class="st-noimg">${ic('image')}</span>`}<span><b>${DIRECTION[a]}</b><small>${used?(p.kind==='ai-demo'?'AI 补图 · 已接受':photoLabel(p)):p?'AI 补图 · 待审核，不会使用':'未上传'}</small></span></li>`;};
    const scene=asset?`<section class="st-scene" id="st-scene"><div class="st-scene-top"><span id="st-scene-status" role="status">正在载入 3D 场景…</span><button class="sw-pilot-chip" id="st-scene-reset">${ic('rotate-ccw')}回到起点</button></div><span class="st-scene-hint">拖动环顾 · WASD 移动 · Q / E 升降</span></section>`
      :`<section class="st-scene st-scene-empty">${ic('box')}<b>${active?'场景生成后会出现在这里':'还没有 3D 场景'}</b><p>${active?'生成期间可以切换到其他景点继续编辑。':'用右侧的照片生成一个可以漫游的空间。'}</p></section>`;
    const status=asset?`<p class="st-world-status ${stale?'warn':''}">${ic(stale?'circle-alert':'circle-check')}${stale?'照片已变化，当前场景用的是旧照片':e(asset.note)}</p>`:'';
    const models=WORLD_MODELS.map(m=>`<label class="st-model ${m.id===model?'active':''}"><input type="radio" name="world-model" value="${m.id}" ${m.id===model?'checked':''}><span><b>${m.name}</b><small>${m.hint}</small></span><em>约 ${m.credits(inputs.length)} credits</em></label>`).join('');
    const action=!caps.world?`<p class="sw-hint">${ic('plug-zap')} 实时生成需要本机服务：在 .env 配置 WORLDLABS_API_KEY 后运行 npm start。</p>`
      :`<button class="button primary full" id="generate-world" ${problem?'disabled':''}>${ic('sparkles')}${asset?'用当前照片重新生成':'生成 3D 场景'}</button>${problem?`<p class="sw-hint">${e(problem)}</p>`:''}`;
    const gen=`<section class="st-gen"><h3>${asset?'更新 3D 场景':'生成 3D 场景'}</h3>${status}<p class="st-lead">送入 ${inputs.length} 张照片。俯视和近景无法标定方向，不参与生成。</p><ul class="st-inputs">${WORLD_ANGLES.map(slot).join('')}</ul>${pendingAI.length?`<button class="plain st-link" data-tab="photos">${ic('scan-eye')}去审核 ${pendingAI.length} 张 AI 补图</button>`:''}${active||['failed','uncertain'].includes(job?.status)?jobHTML(job):`<div class="st-models" role="radiogroup" aria-label="生成模型">${models}</div>${action}`}</section>`;
    const r=roamOf(s);
    const roam=asset?`<section class="st-roam"><h3>可漫游范围</h3><p class="st-lead">游客只能在照片机位附近活动，超出部分多是模型推测。拖动滑块，左侧预览立即生效。</p>${ROAM_AXES.map(([k,label])=>`<label class="st-range">${label}<input type="range" min="0" max="5" step="0.1" value="${r[k]}" data-roam="${k}"><output id="roam-${k}">${r[k].toFixed(1)} m</output></label>`).join('')}<button class="plain" id="roam-reset">${ic('undo-2')}恢复默认范围</button><a class="plain" href="${e(asset.receipt)}" target="_blank" rel="noopener">${ic('file-json')}生成记录</a></section>`:'';
    return `<div class="st-world">${scene}<aside class="st-world-side">${gen}${roam}</aside></div>${infoNote('生成会把上面的照片上传到 World Labs，并按所选模型扣除 credits。生成的场景保存在本机 data/worlds，发布后本机游客端可见；公开静态站点看不到。范围随发布快照一起更新到游客端。')}`;
  }
  // Production helpers: rule-based results kept beside the draft (state.helpers) until the staff adopt them.
  // Quality checks are not stored; they always describe the current draft.
  const G=()=>geoFor(state.id);
  const helper=id=>state.helpers?.[id];
  const openScripts=new Set();let lastQA=null;
  function runHelper(id){
    const d=state.draft,prev=helper(id),t=performance.now();
    const result=id==='geo'?runGeo(d,G()):id==='script'?runScript(d,runGeo(d,G())):runTrip(d,prev?.opts,G());
    state.helpers={...state.helpers,[id]:{result,input:helperInput(d,id),at:new Date().toISOString(),ms:Math.max(1,Math.round(performance.now()-t)),opts:prev?.opts||{},edits:prev?.edits||{}}};
  }
  const headingOf=g=>{const v=helper('geo')?.edits?.[g.id];return Number.isFinite(v)?v:g.heading;};
  const scriptOf=r=>helper('script')?.edits?.[r.id]??r.text;
  const shortName=id=>e((state.draft.spots.find(s=>s.id===id)?.name||'').split(' · ')[0]);
  function adopted(id){
    const run=helper(id),d=state.draft,byId=x=>d.spots.find(s=>s.id===x);
    if(id==='geo')return run.result.spots.filter(g=>g.has3D).every(g=>byId(g.id)?.heading===headingOf(g));
    if(id==='script')return run.result.spots.every(r=>!byId(r.id)||byId(r.id).narration?.text===scriptOf(r));
    return !run.result.problem&&JSON.stringify(d.trip||null)===JSON.stringify(tripOf(run.result));
  }
  function helperStatus(id){
    if(id!=='script'&&!G())return ['需要 3D 地图底图',''];
    const run=helper(id);if(!run)return ['未运行',''];
    if(run.input!==helperInput(state.draft,id))return ['草稿有变化，建议重新运行','warn'];
    if(id==='trip'&&run.result.problem)return ['无法生成','warn'];
    return adopted(id)?['已采用','ok']:['待采用','warn'];
  }
  const qaStatus=qa=>qa.block?[qa.block+' 项阻止发布','bad']:qa.warn?[qa.warn+' 项待核实','warn']:['可以发布','ok'];
  function makeCard(id,body,foot){
    const h=HELPERS.find(x=>x.id===id),run=helper(id),[text,cls]=helperStatus(id),off=id!=='script'&&!G();
    return `<section class="mk-card" id="mk-${id}"><header class="mk-head"><span class="mk-icon">${ic(h.icon)}</span><div><h2>${h.name}<em>按规则生成</em></h2><p>${h.does}</p></div><span class="st-status ${cls}">${text}</span>${off?'':`<button class="button small outline" data-run="${id}">${ic(run?'refresh-cw':'play')}${run?'重新运行':'运行'}</button>`}</header>${off?`<p class="mk-empty">这个景区还没有 3D 地图底图。</p>`:run?`<div class="mk-body">${body(run)}</div><footer class="mk-foot"><small>${new Date(run.at).toLocaleString('zh-CN',{hour12:false})} 运行 · 用时 ${run.ms} 毫秒</small><span class="button-row">${foot(run)}</span></footer>`:`<p class="mk-empty">还没有运行。</p>`}</section>`;
  }
  function geoCard(){
    return makeCard('geo',run=>`<table class="mk-table"><thead><tr><th>景点</th><th>在 3D 地图上</th><th>邻近景点</th><th>场景朝向</th></tr></thead><tbody>${run.result.spots.map(g=>{
      if(!state.draft.spots.some(s=>s.id===g.id))return '';
      if(!g.matched)return `<tr class="off"><td><b>${shortName(g.id)}</b></td><td colspan="3">不在 3D 地图的底图里，3D 地图上不会出现</td></tr>`;
      const h=headingOf(g);
      return `<tr><td><b>${shortName(g.id)}</b><small>${e(g.scene)}</small></td><td>东经 ${g.lon}°<br>北纬 ${g.lat}°</td><td><ul class="mk-near">${g.neighbours.map(n=>`<li>${n.dir} · ${e(n.name)}<small>${n.boat?'含游船':'步行'} ${n.meters} 米 · 约 ${n.minutes} 分钟</small></li>`).join('')}</ul></td><td>${g.has3D?`<label class="mk-heading"><i>场景朝向</i><input class="mk-deg" type="number" min="0" max="359" step="1" value="${h??''}" data-heading="${e(g.id)}" aria-label="${shortName(g.id)} 场景朝向"><span>°</span></label><a class="st-link" data-heading-check="${e(g.id)}" href="#pilot?s=${encodeURIComponent(sid)}&id=${encodeURIComponent(g.id)}&heading=${h??0}" target="_blank" rel="noopener">${ic('compass')}到 3D 里核对</a>`:'<small>没有 3D 场景</small>'}</td></tr>`;}).join('')}</tbody></table><p class="mk-tip">场景朝向是 3D 场景起始视线的方位角，正北为 0°、顺时针增加。单景 3D 里的路标按它换算方向，路标指错时改这里。</p>`,
      run=>`<button class="button small primary" data-adopt="geo" ${run.result.spots.some(g=>g.has3D)?'':'disabled'}>${ic('check')}采用朝向到草稿</button>`);
  }
  function scriptCard(geo){
    return makeCard('script',run=>`<div class="mk-scripts">${run.result.spots.map(r=>{
      const s=state.draft.spots.find(x=>x.id===r.id);if(!s)return '';
      const text=scriptOf(r),edited=text!==r.text,done=s.narration?.text===text,extra=edited?untraced(text,s,geo.spots.find(g=>g.id===r.id)):[];
      return `<details class="mk-script" data-script-box="${e(r.id)}" ${openScripts.has(r.id)?'open':''}><summary><b>${shortName(r.id)}</b><span class="st-chip ${done?'ok':'warn'}">${done?'已采用':edited?'已修改 · 待采用':'待采用'}</span><small>${r.sentences.length} 句 · 朗读约 ${Math.max(5,Math.round(text.length/4.5/5)*5)} 秒</small></summary>
<h4>生成稿 · 每句出处</h4><ol class="mk-sentences">${r.sentences.map(x=>`<li><span class="mk-src ${x.from}">${SOURCE_LABEL[x.from]}</span>${e(x.text)}</li>`).join('')}</ol>
<label class="mk-edit">讲解稿 · 可以直接修改<textarea rows="6" maxlength="1500" data-script="${e(r.id)}">${e(text)}</textarea></label>${extra.length?`<p class="mk-warn">${ic('triangle-alert')}这些句子在资料里找不到，请核实：${extra.map(t=>'「'+e(t)+'」').join('')}</p>`:''}
<div class="button-row"><button class="plain" data-listen="${e(r.id)}">${ic('volume-2')}<span>试听</span></button>${edited?`<button class="plain" data-restore="${e(r.id)}">${ic('undo-2')}恢复生成稿</button>`:''}<button class="button small primary" data-adopt-script="${e(r.id)}" ${done?'disabled':''}>${ic('check')}采用</button></div></details>`;}).join('')}</div>`,
      ()=>`<button class="button small primary" data-adopt="script">${ic('check-check')}全部采用</button>`);
  }
  function tripCard(){
    return makeCard('trip',run=>{
      const r=run.result,o=run.opts||{},pool=r.pool||[],inc=new Set(r.include||pool);
      const form=`<div class="mk-trip-opts"><label>标题<input data-trip-opt="title" maxlength="30" value="${e(o.title||'')}" placeholder="${e(r.title||'')}"></label><label>起点<select data-trip-opt="start">${pool.filter(id=>inc.has(id)).map(id=>`<option value="${e(id)}" ${id===r.start?'selected':''}>${shortName(id)}</option>`).join('')}</select></label><label>每处停留<span class="mk-unit"><input class="mk-num-input" type="number" min="0" max="120" step="5" data-trip-opt="stay" value="${r.stay??o.stay??20}">分钟</span></label><fieldset class="mk-include"><legend>包含的景点</legend>${pool.map(id=>`<label class="mk-chip"><input type="checkbox" data-trip-include="${e(id)}" ${inc.has(id)?'checked':''}>${shortName(id)}</label>`).join('')}</fieldset></div>`;
      return form+(r.problem?`<p class="mk-warn">${ic('triangle-alert')}${e(r.problem)}</p>`:`<div class="mk-trip-preview">${tripCardHTML(tripOf(r),state.draft.spots,{G:G()})}</div>`);
    },run=>`<a class="button small outline" href="${link('trip')}" target="_blank" rel="noopener">${ic('eye')}游客端行程卡片</a><button class="button small primary" data-adopt="trip" ${run.result.problem?'disabled':''}>${ic('check')}采用到草稿</button>`);
  }
  function qaCard(qa){
    const h=HELPERS.find(x=>x.id==='qa'),[text,cls]=qaStatus(qa),icon={block:'octagon-x',warn:'triangle-alert',info:'info',ok:'circle-check'};
    return `<section class="mk-card" id="mk-qa"><header class="mk-head"><span class="mk-icon">${ic(h.icon)}</span><div><h2>${h.name}<em>实时检查</em></h2><p>${h.does}</p></div><span class="st-status ${cls}">${text}</span></header><div class="mk-body"><ul class="mk-checks">${qa.checks.map((c,i)=>`<li class="${c.level}">${ic(icon[c.level])}<span>${e(c.text)}</span>${c.spotId||c.helper?`<button class="plain" data-qa-fix="${i}">去处理${ic('arrow-right')}</button>`:''}</li>`).join('')}</ul></div></section>`;
  }
  function studioMake(){
    const d=state.draft,qa=lastQA=runQA(d,G()),geo=runGeo(d,G());
    const steps=HELPERS.map((h,i)=>{const [text,cls]=h.id==='qa'?qaStatus(qa):helperStatus(h.id);return `<li class="mk-step ${cls}"><a href="#mk-${h.id}" data-goto="${h.id}"><span class="mk-num">${i+1}</span>${ic(h.icon)}<b>${h.name}</b><small>${text}</small></a></li>`;}).join('');
    return `<div class="st-pane-head"><h1>制作助手</h1><div class="button-row"><button class="button small primary" id="run-all">${ic('play')}全部运行</button></div></div><p class="st-lead">四个助手读取当前草稿，按规则计算或重排已有资料，不会补充资料里没有的内容。结果先放在这里，看过、改过再采用到草稿，发布时随草稿更新到游客端。</p>${G()?'':`<p class="mk-banner">${ic('map')}这个景区还没有 3D 地图底图，地图校准和行程卡暂不可用；讲解稿和质检照常。</p>`}<ol class="mk-flow">${steps}</ol>${geoCard()}${scriptCard(geo)}${tripCard()}${qaCard(qa)}${infoNote('地图校准用 OpenStreetMap 湖岸和步行、游船路网计算；讲解稿只取讲解资料（没有时取游客介绍）、算出的邻近景点和运营提示；行程卡比较所有游览顺序，取用时最短的一种；质检逐句查找采用后讲解稿的出处。运行结果和修改保存在本机，采用后才进入草稿。')}`;
  }
  function bindMake(){
    const d=state.draft,byId=id=>d.spots.find(s=>s.id===id);
    $('#run-all').onclick=guarded(async()=>{for(const id of ['geo','script','trip'])if(id==='script'||G())runHelper(id);await persist('助手已运行，结果在下方');});
    $$('[data-run]').forEach(b=>b.onclick=guarded(async()=>{runHelper(b.dataset.run);await persist();}));
    $$('[data-goto]').forEach(a=>a.onclick=ev=>{ev.preventDefault();$('#mk-'+a.dataset.goto)?.scrollIntoView({behavior:'smooth',block:'start'});});
    // Inputs are read again on adopt: a blur-triggered change and the click can arrive together.
    const readHeadings=()=>$$('[data-heading]').forEach(i=>{const v=Math.round(Number(i.value));if(i.value!==''&&v>=0&&v<=359)helper('geo').edits[i.dataset.heading]=v;});
    $$('[data-heading]').forEach(i=>i.onchange=guarded(async()=>{
      const v=Math.round(Number(i.value));if(i.value===''||!(v>=0&&v<=359))throw Error('朝向请填 0 到 359 之间的角度');
      readHeadings();const a=$(`[data-heading-check="${CSS.escape(i.dataset.heading)}"]`);if(a)a.href=a.href.replace(/heading=[^&]*/,'heading='+v);await persist('',false);
    }));
    $('[data-adopt="geo"]')?.addEventListener('click',guarded(async()=>{readHeadings();for(const g of helper('geo').result.spots.filter(g=>g.has3D)){const s=byId(g.id);if(s)s.heading=headingOf(g);}await persist('场景朝向已采用到草稿');}));
    const readScripts=()=>$$('[data-script]').forEach(t=>{const run=helper('script'),r=run.result.spots.find(x=>x.id===t.dataset.script),v=t.value.trim();if(!r)return;if(v&&v!==r.text)run.edits[r.id]=v;else delete run.edits[r.id];});
    $$('[data-script]').forEach(t=>t.onchange=guarded(async()=>{readScripts();await persist('',false);}));
    $$('[data-script-box]').forEach(x=>x.ontoggle=()=>{if(x.open)openScripts.add(x.dataset.scriptBox);else openScripts.delete(x.dataset.scriptBox);});
    $$('[data-listen]').forEach(b=>bindSpeak(b,()=>$(`[data-script="${CSS.escape(b.dataset.listen)}"]`)?.value||''));
    $$('[data-restore]').forEach(b=>b.onclick=guarded(async()=>{delete helper('script').edits[b.dataset.restore];await persist();}));
    const adoptScript=r=>{const s=byId(r.id);if(s)s.narration={text:scriptOf(r),basis:r.basis,adoptedAt:new Date().toISOString()};};
    $$('[data-adopt-script]').forEach(b=>b.onclick=guarded(async()=>{readScripts();adoptScript(helper('script').result.spots.find(x=>x.id===b.dataset.adoptScript));await persist('讲解稿已采用到草稿');}));
    $('[data-adopt="script"]')?.addEventListener('click',guarded(async()=>{readScripts();helper('script').result.spots.forEach(adoptScript);await persist('讲解稿已全部采用到草稿');}));
    const rerunTrip=async()=>{runHelper('trip');await persist();};
    $$('[data-trip-opt]').forEach(i=>i.onchange=guarded(async()=>{const run=helper('trip');run.opts={...run.opts,[i.dataset.tripOpt]:i.dataset.tripOpt==='stay'?Number(i.value):i.value.trim()};await rerunTrip();}));
    $$('[data-trip-include]').forEach(c=>c.onchange=guarded(async()=>{const run=helper('trip');run.opts={...run.opts,include:$$('[data-trip-include]').filter(x=>x.checked).map(x=>x.dataset.tripInclude)};await rerunTrip();}));
    $('[data-adopt="trip"]')?.addEventListener('click',guarded(async()=>{const t=tripOf(helper('trip').result);if(!t)throw Error(helper('trip').result.problem);d.trip=t;await persist('行程卡已采用到草稿');}));
    $$('[data-qa-fix]').forEach(b=>b.onclick=()=>{const c=lastQA.checks[b.dataset.qaFix];if(c.spotId){selected=c.spotId;view='spot';tab=c.tab||'info';draw();return;}const el=$('#mk-'+c.helper);if(el){el.scrollIntoView({behavior:'smooth',block:'start'});el.classList.remove('sw-flash');void el.offsetWidth;el.classList.add('sw-flash');}});
  }
  // Studio home: one card per scenic area; each is edited and published on its own.
  function homeStatus(sc){const n=draftChanges(sc).length;return !sc.published?['未发布','warn']:n?[n+' 处改动未发布','warn']:['已发布 v'+sc.publishNumber,''];}
  function drawStudioHome(){
    const card=sc=>{const [text,cls]=homeStatus(sc);return `<article class="sj-card"><a class="sj-link" href="#studio?s=${encodeURIComponent(sc.id)}"><div class="sj-cover"><img src="${e(webImageUrl(sc.draft.map.url))}" alt="" loading="lazy"></div><div class="sj-body"><h2>${e(sc.draft.title)}</h2><div class="sj-meta"><span>${ic('map-pin')}${sc.draft.spots.length} 处景点</span><span class="st-status ${cls}">${ic(cls?'circle-dot':'circle-check')}${text}</span></div></div></a><button class="plain sw-danger sj-delete" data-delete-scenic="${e(sc.id)}" aria-label="删除${e(sc.draft.title)}">${ic('trash-2')}</button></article>`;};
    host.innerHTML=`<div class="st-shell"><header class="st-top"><a class="brand" href="#studio"><img src="/favicon.svg" alt=""><span>景见<small>STUDIO</small></span></a><div class="st-top-actions"><a class="button small outline" href="#scenics" target="_blank" rel="noopener">${ic('eye')}预览游客端</a></div></header><main class="sj-page"><div class="sj-head"><h1>我的景区</h1><p>每个景区单独编辑、单独发布；游客端只显示已发布的景区。</p></div><div class="sj-grid">${ws.scenics.map(card).join('')}<button class="sj-card sj-new" id="new-scenic">${ic('plus')}<b>新建景区</b><small>起个名字，上传一张游览地图</small></button></div></main></div>`;
    $('#new-scenic').onclick=()=>showNewScenic();
    $$('[data-delete-scenic]').forEach(b=>b.onclick=()=>showDeleteScenic(ws.scenics.find(x=>x.id===b.dataset.deleteScenic)));
  }
  function showNewScenic(){
    const d=dialog(`<div class="sw-dialog-top"><span>新建景区</span><button class="plain" data-close aria-label="关闭">${ic('x')}</button></div><form class="sw-dialog-copy st-form" id="new-scenic-form"><label>景区名称<input id="new-scenic-name" maxlength="60" required placeholder="例如：灵隐 · 飞来峰"></label><label>游览地图<input id="new-scenic-map" type="file" accept="image/jpeg,image/png,image/webp" required></label><p class="sw-hint">游客在这张图上选景点，插画或示意图都可以。JPG / PNG / WebP，单张不超过 12 MB，之后可以更换。</p><div class="button-row"><button type="button" class="button outline" data-close>取消</button><button class="button primary" type="submit">${ic('plus')}创建并开始编辑</button></div></form>`);
    d.querySelector('#new-scenic-form').onsubmit=guarded(async ev=>{ev.preventDefault();const title=d.querySelector('#new-scenic-name').value.trim(),f=d.querySelector('#new-scenic-map').files[0];if(!title)throw Error('请填写景区名称');if(!f)throw Error('请选择一张地图');const img=await imageFile(f),sc=newScenic(title,{url:img.url,name:img.name,custom:true});ws.scenics.push(sc);await saveScenic(ws);d.close();location.hash='#studio?s='+encodeURIComponent(sc.id);});
  }
  function showDeleteScenic(sc){
    const d=dialog(`<div class="sw-dialog-copy"><h2>删除「${e(sc.draft.title)}」？</h2><p>草稿和已发布内容会一起删除，游客端立即看不到这个景区，本机上传的图片也会被清理。需要的话先进入景区导出备份。</p><div class="button-row"><button class="button outline" data-close>保留</button><button class="button primary" id="delete-scenic-confirmed">确认删除</button></div></div>`);
    d.querySelector('#delete-scenic-confirmed').onclick=guarded(async()=>{ws.scenics=ws.scenics.filter(x=>x!==sc);d.close();await persist('已删除景区');});
  }
  function drawCreator(){
    if(!state)return drawStudioHome();
    if(view==='spot'&&!spot())view='map';
    if(!spot())selected=state.draft.spots[0]?.id;
    studioScene?.dispose();studioScene=null;
    host.innerHTML=`<div class="st-shell">${studioHeader()}<div class="st-body">${studioSidebar()}<main class="sw-work-main st-main">${saveError?`<p class="sw-save-error" role="alert">${e(saveError)}</p>`:''}<fieldset class="sw-fieldset" ${busy?'disabled':''}>${view==='map'?studioMap():view==='make'?studioMake():studioSpot()}</fieldset></main></div></div>`;
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
    $$('[data-marker]').forEach(b=>b.onclick=ev=>{ev.stopPropagation();selected=b.dataset.marker;history.replaceState(null,'',link('map',selected)+'&view=scroll');draw();$('[data-marker="'+CSS.escape(selected)+'"]')?.focus({preventScroll:true});$('#spot-card')?.scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});});
  }
  function showPublish(){
    const changes=draftChanges(state),problems=publishProblems(state.draft);
    const d=dialog(`<div class="sw-dialog-top"><span>发布到游客端</span><button class="plain" data-close aria-label="关闭">${ic('x')}</button></div><div class="sw-dialog-copy st-publish">${problems.length?`<h3>还有 ${problems.length} 项需要处理</h3><ul class="st-problems">${problems.map((p,i)=>`<li>${ic('circle-alert')}<span>${e(p.text)}</span>${p.spotId?`<button class="plain" data-fix="${i}">去处理 ${ic('arrow-right')}</button>`:''}</li>`).join('')}</ul>`:`<h3>这次会更新</h3><ul class="st-changes">${changes.map(c=>`<li>${ic('dot')}${e(c)}</li>`).join('')}</ul><label class="sw-check-label"><input type="checkbox" id="publish-rights">已核对图片使用权、AI 标记、讲解和介绍。</label><div class="button-row"><button class="button outline" data-close>再看看</button><button class="button primary" id="publish-map">${ic('send')}发布 v${state.publishNumber+1}</button></div><p class="sw-hint">发布只更新本浏览器的游客端；之后继续编辑草稿不会影响已发布内容。</p>`}</div>`);
    d.querySelectorAll('[data-fix]').forEach(b=>b.onclick=()=>{const p=problems[b.dataset.fix];selected=p.spotId;view='spot';tab=p.tab;d.close();draw();});
    const go=d.querySelector('#publish-map');
    if(go)go.onclick=guarded(async()=>{if(!d.querySelector('#publish-rights').checked)throw Error('请先勾选核对项');const next=copy(state);publishScenic(next);const nextWs={...ws,scenics:ws.scenics.map(x=>x===state?next:x)};await saveScenic(nextWs);ws=nextWs;state=next;d.close();draw();notify('已发布 v'+state.publishNumber+'，游客端已更新');});
  }
  function bindCreator(){
    const nav=fn=>()=>{if(busy)return;placement='';fn();draw();};
    $$('[data-view]').forEach(b=>b.onclick=nav(()=>{view=b.dataset.view;}));
    $$('[data-spot]').forEach(b=>b.onclick=nav(()=>{selected=b.dataset.spot;view='spot';}));
    $$('[data-tab]').forEach(b=>b.onclick=nav(()=>{tab=b.dataset.tab;}));
    $('#add-spot').onclick=()=>{if(busy)return;view='map';placement='add';draw();};
    $('#open-publish').onclick=()=>showPublish();
    $('#export-scenic').onclick=guarded(async()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({format:'jingjian-scenic-backup',exportedAt:new Date().toISOString(),state:await exportState(ws)},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='景见-地图与多视角备份.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);});
    $('#scenic-title').onchange=guarded(async ev=>{const value=ev.target.value.trim();if(!value){ev.target.value=state.draft.title;throw Error('景区名称不能为空');}state.draft.title=value;await persist();});
    if(view==='make'){bindMake();return;}
    if(view==='map'){
      bindEditMap();
      $('#scenic-intro').onchange=guarded(async ev=>{state.draft.intro=ev.target.value.trim();await persist();});
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
      $$('input[name="world-model"]').forEach(r=>r.onchange=()=>{worldModel=r.value;$$('.st-model').forEach(l=>l.classList.toggle('active',l.querySelector('input').checked));});
      $('#generate-world')?.addEventListener('click',()=>showGenerate(s));
      $('#job-dismiss')?.addEventListener('click',guarded(async()=>{delete state.jobs[s.id];await persist();}));
      const asset=worldAsset(s);if(!asset)return;
      const status=$('#st-scene-status');
      studioScene=mountPilotScene($('#st-scene'),{asset,roam:s.roam,
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
    galleryDialog.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>galleryDialog.close()));return galleryDialog;
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
  // ---- Real world generation ----
  function showGenerate(s){
    const model=modelOf(modelFor(s)),inputs=worldInputs(s),cost=model.credits(inputs.length);
    const d=dialog(`<div class="sw-dialog-top"><span>生成 3D 场景</span><button class="plain" data-close aria-label="关闭">${ic('x')}</button></div><div class="sw-dialog-copy st-confirm"><h3>${e(s.name)} · ${model.name}</h3><ul class="st-changes"><li>${ic('images')}送入 ${inputs.length} 张照片：${inputs.map(i=>DIRECTION[i.angle]+(i.kind==='ai-demo'?'（AI）':'')).join('、')}</li><li>${ic('coins')}预计消耗约 ${cost} credits<span id="credit-left"></span></li><li>${ic('upload-cloud')}照片会上传到 World Labs 处理</li></ul><p class="sw-hint">${model.hint}。生成完成前可以离开这个页面，回来后会继续显示进度。</p><div class="button-row"><button class="button outline" data-close>取消</button><button class="button primary" id="generate-confirmed">${ic('sparkles')}开始生成</button></div></div>`);
    fetch('/api/worlds/credits').then(r=>r.ok?r.json():null).then(v=>{const el=d.querySelector('#credit-left');if(el&&Number.isFinite(v?.credits))el.textContent=' · 当前余额 '+Math.floor(v.credits);}).catch(()=>{});
    d.querySelector('#generate-confirmed').onclick=guarded(async()=>{d.close();await startWorld(s.id,model.id);});
  }
  // Uploaded images live in IndexedDB; the server reads built-in /assets/ originals itself.
  async function imageSource(url){
    if(!url.startsWith(REF))return url;
    const blob=await (await fetch(webImageUrl(url))).blob();
    return new Promise((resolve,reject)=>{const f=new FileReader();f.onload=()=>resolve(f.result);f.onerror=()=>reject(Error('读取图片失败'));f.readAsDataURL(blob);});
  }
  async function startWorld(spotId,model){
    const s=state.draft.spots.find(x=>x.id===spotId),problem=s?worldProblem(s):'景点不存在';if(problem)throw Error(problem);
    if(['uploading','running'].includes(state.jobs?.[spotId]?.status))throw Error('这个景点已有生成任务在进行');
    const inputs=worldInputs(s),requestId=crypto.randomUUID();
    state.jobs={...state.jobs,[spotId]:{requestId,model,status:'uploading',inputs,startedAt:new Date().toISOString()}};
    submitting.add(requestId);await persist('',true);
    try{
      const images=await Promise.all(inputs.map(async i=>({angle:i.angle,kind:i.kind,src:await imageSource(i.url)})));
      const r=await fetch('/api/worlds',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId,model,name:s.name,images})});
      const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.error||'提交失败（HTTP '+r.status+'）');
      Object.assign(state.jobs[spotId],{status:data.status,error:data.error||''});
      notify(data.status==='running'?'已提交，World Labs 正在生成':data.error||'提交状态不确定');
    }catch(err){delete state.jobs[spotId];notify(err.message);}
    finally{submitting.delete(requestId);}
    await persist('',false);safeDraw();schedulePoll();
  }
  // Redraw unless staff are mid-typing elsewhere; the sidebar still updates.
  function safeDraw(){const a=document.activeElement;if(a&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)&&!['radio','range','checkbox','file'].includes(a.type)){updateStatus();return;}draw();}
  function schedulePoll(){
    clearTimeout(pollTimer);
    if(!alive||!state?.jobs||!Object.values(state.jobs).some(j=>j.status==='running'||j.status==='uploading'))return;
    pollTimer=setTimeout(pollJobs,4000);
  }
  async function pollJobs(){
    for(const [spotId,job] of Object.entries(state.jobs||{})){
      if(!['uploading','running'].includes(job.status)||submitting.has(job.requestId))continue;
      let next;
      try{const r=await fetch('/api/worlds/'+encodeURIComponent(job.requestId));next=await r.json().catch(()=>({}));if(r.status===404)next={status:'failed',error:'本机服务没有这个任务的记录（可能在上传阶段中断，未扣费）。'};else if(!r.ok)continue;}
      catch{continue;}// Offline for a moment; try again next round.
      // Publishing swaps `state` for a copy, so always act on the current job object.
      const cur=state.jobs?.[spotId];if(!alive||cur?.requestId!==job.requestId)continue;
      const s=state.draft.spots.find(x=>x.id===spotId);
      if(next.status==='done'&&next.result&&s){
        applyGeneratedWorld(s,cur,next.result);delete state.jobs[spotId];
        await persist(s.name+' 的 3D 场景已生成'+(next.result.credits?'，消耗 '+next.result.credits+' credits':''),false);safeDraw();
      }else if(next.status!==cur.status){
        Object.assign(cur,{status:next.status,error:next.error||'',stage:next.stage||'',progress:next.progress||''});
        await persist(next.status==='failed'?s?.name+'：3D 生成失败':'',false);safeDraw();
      }else{
        Object.assign(cur,{stage:next.stage||'',progress:next.progress||''});
        const el=$('#st-job');if(el&&selected===spotId){el.outerHTML=jobHTML(cur);hydrate();}
      }
    }
    schedulePoll();
  }
  function draw(){if(!alive||!ws)return;if(isCreator)drawCreator();else drawVisitor();hydrate();}
  host.innerHTML=frame(`<main class="page sw-empty" role="status">正在打开景区…</main>`);
  const health=fetch('/api/health',{signal:AbortSignal.timeout(1500)}).then(r=>r.ok?r.json():{}).catch(()=>({}));
  Promise.all([loadScenic(),health]).then(([value,h])=>{if(!alive)return;caps=h||{};ws=value;state=ws.scenics.find(x=>x.id===sid)||null;draw();if(isCreator)schedulePoll();}).catch(err=>notify(err.message));
  ticker=setInterval(()=>{const el=$('#st-job-time'),job=state?.jobs?.[selected];if(el&&job?.startedAt)el.textContent=elapsed(job);},1000);
  return ()=>{alive=false;stopSpeaking();clearTimeout(jobTimer);clearTimeout(pollTimer);clearInterval(ticker);galleryDialog?.remove();studioScene?.dispose();};
}
