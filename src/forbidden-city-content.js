import sources from '../public/assets/forbidden-city/real/sources.json' with {type:'json'};
import geography from './map3d/data/forbidden-city/geography.json' with {type:'json'};
// Reviewed content seed. Future seed revisions must never overwrite a user's edits.
const facts={
 wumen:'从午门开始，看看两翼展开的城楼，再沿着院落向宫城深处走去。抬头辨认建筑的层次，是读懂故宫的第一步。',
 taihemen:'内金水河之后，太和门把视线引向外朝。先在门前看看桥与广场，再沿侧边通道继续探索。',
 taihedian:'金色屋顶之下，层层白石台基托起太和殿。站在广场回望中轴，感受建筑与空旷院落共同形成的秩序。',
 zhonghedian:'三大殿之间，中和殿以较小的方形体量和四角攒尖顶形成节奏变化。看看它与前后两座大殿有什么不同。',
 baohedian:'走过中和殿，来到外朝三大殿的北端。回望重叠的屋脊，再循着院落走向内廷。',
 qianqinggong:'穿过乾清门，院落的尺度逐渐收拢。乾清宫位于内廷中轴线上，是了解宫廷生活与政务的重要一站。',
 jiaotaidian:'交泰殿位于乾清宫与坤宁宫之间。小巧方正的殿堂，让中轴上的建筑再次呈现大小相间的韵律。',
 kunninggong:'中轴上的后三宫行至坤宁宫。朱墙、殿门与屋檐之后，北面的御花园带来另一种游览节奏。',
 garden:'走进御花园，规整的宫殿院落转为古树、亭阁与叠石的层次。放慢脚步，看看树影与屋顶相遇的地方。',
 shenwumen:'沿着中轴走到神武门，回望这一路经过的院落与宫殿。它也是今天故宫参观的出口之一。',
 ningshou:'离开中轴向东探访宁寿宫区。这里以另一组完整的宫殿院落展开，照片展示其中的皇极殿。',
 cining:'向西走进慈宁宫区，在另一片朱墙金瓦之间，了解与中轴大殿不同的宫廷空间。照片为慈宁宫正殿局部。'
};
// Pins are reviewed against the generated artistic scroll, independently of metric geometry.
const pins={wumen:[.5,.84],taihemen:[.5,.66],taihedian:[.5,.49],zhonghedian:[.5,.37],baohedian:[.5,.29],qianqinggong:[.5,.215],jiaotaidian:[.5,.17],kunninggong:[.5,.137],garden:[.46,.1],shenwumen:[.5,.047],ningshou:[.73,.2],cining:[.21,.41]};
export function createPalaceScenic(){
 const spots=sources.images.map(s=>{
  const guide=s.officialSummary+' '+facts[s.id],notice=s.id==='taihemen'?'太和门主通道按施工公告关闭；本地图侧向绕行为游览示意，现场通行以故宫公告为准。':'照片拍摄于不同年份；实际开放与展陈以故宫博物院当日公告为准。';
  const credit={...s,artist:s.author,source:s.sourcePage,date:s.captureDate,changes:s.transformations.join('；')};
  return {id:s.id,name:s.name,description:facts[s.id],guide,notice,factSource:s.officialSource,x:pins[s.id][0],y:pins[s.id][1],heading:0,photos:{front:{url:s.path,name:s.caption,kind:'real',accepted:true,credit}},revision:0,confirmedRevision:null,world:null,narration:{text:guide},scene:geography.spots[s.id].scene};
 });
 const draft={title:'故宫 · 宫阙之间',intro:'沿着中轴穿过层层院落，在朱墙金瓦间探索十二处宫城风景。',map:{url:'/assets/forbidden-city/palace-scroll.jpg',name:'故宫游览绘卷 · AI 插画',legend:'故宫建筑布局意象 · AI 绘卷与点位示意',custom:false},spots};
 return {schema:7,id:'forbidden-city',draft,published:structuredClone(draft),publishedAt:null,publishNumber:1};
}
export function ensureBuiltinScenics(ws){
 const applied=new Set(ws.seededScenics||[]);
 if(!applied.has('forbidden-city')){if(!ws.scenics.some(s=>s.id==='forbidden-city'))ws.scenics.push(createPalaceScenic());applied.add('forbidden-city');}
 ws.seededScenics=[...applied];return ws;
}
