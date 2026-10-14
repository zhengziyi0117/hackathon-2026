import sources from '../public/assets/real/sources.json' with {type:'json'};
export const PILOT_ID='huagang';
export const PILOT_SOURCE=sources.huagang;
export const realPhoto=(id,name)=>({url:sources[id].path,name,kind:'real',accepted:true,credit:sources[id]});
// Demo guide material: well-known public facts, condensed for the prototype. Scenic staff must verify before real use.
const GUIDES={
 huagang:'花港观鱼是西湖十景之一，位于西湖西南、苏堤南段一带。景名源于南宋时这里的私家花园与观鱼景致。园中的御碑亭内立有碑石，碑上的“花港观鱼”四字相传为清代康熙皇帝题写。今天的公园以花、港、鱼为主题，园中有红鱼池与牡丹园。',
 duanqiao:'断桥位于白堤东端，是西湖十景“断桥残雪”所在地。冬日雪后，桥面向阳一侧积雪先化，远看像桥身断开，“断桥残雪”由此得名。民间传说《白蛇传》中，白娘子与许仙在断桥相遇。',
 pinghu:'平湖秋月位于白堤西端、孤山南麓，是西湖十景之一。这里临水而建，视野开阔，是传统的秋夜赏月之处。景点内有临水平台与亭阁，可以眺望外西湖湖面。',
 quyuan:'曲院风荷是西湖十景之一，位于西湖西北岸、苏堤北端附近。南宋时这里有酿酒的作坊，湖面种植荷花，夏日荷风送香，因而得名。今天的园区以夏季赏荷闻名，园中可见玉带桥。',
 santan:'三潭印月位于西湖中的小瀛洲岛，是西湖十景之一。岛南湖面上立有三座石塔，月夜在塔中点灯时，灯光与月影倒映湖中，形成“三潭印月”的景致。这一景常被用作西湖的标志性画面。',
 leifeng:'雷峰塔位于西湖南岸的夕照山上，“雷峰夕照”是西湖十景之一。原塔始建于五代吴越国时期，1924 年倒塌；现在的塔是 2002 年在原址上重建的。民间传说《白蛇传》中，白娘子被镇于雷峰塔下。'
};
export const GUIDE_SEED=GUIDES;
export const PLACES=[
 {id:'huagang',name:'花港观鱼 · 御碑亭',x:0.388,y:0.862,description:'到花港观鱼，在御碑亭前停一停。石柱、灰瓦与临水园径，把西湖十景中的一处风景收进眼前。这次先从亭前的一张实拍，试着走进它的空间。',photoName:'花港观鱼御碑亭 · 正面实拍',factSource:'https://wbdl.hzwbzx.cn/house?id=121'},
 {id:'duanqiao',name:'断桥',x:0.652,y:0.092,description:'桥上是行人的脚步，桥下是铺开的湖光。先看看雨中的断桥，再把这处熟悉的西湖风景放进你的游览清单。',photoName:'雨中的断桥 · 2025 年实拍'},
 {id:'pinghu',name:'平湖秋月',x:0.505,y:0.285,description:'借一张园林实拍，看看平湖秋月一带的水岸、石桥与树影。不同季节，自有不同的停留理由。',photoName:'平湖秋月园景 · 2010 年实拍'},
 {id:'quyuan',name:'曲院风荷',x:0.172,y:0.375,description:'从水面延伸到岸边的绿意，是曲院风荷的另一种看法。照片从高处望向园区与玉带桥，夏日荷景则留待下次亲自相遇。',photoName:'曲院风荷一带与玉带桥 · 实拍'},
 {id:'santan',name:'三潭印月',x:0.472,y:0.712,description:'湖面上的石塔、远处的山和来往的小船，共同组成三潭印月的经典风景。先从湖上的视角，与这处风景相遇。',photoName:'三潭印月石塔与湖面 · 实拍'},
 {id:'leifeng',name:'雷峰塔',x:0.613,y:0.738,description:'隔着湖面望向雷峰塔，塔影从树梢上显露出来。把视线从近处的水面慢慢移向山丘，感受西湖风景的层次。',photoName:'湖对岸的雷峰塔 · 2025 年实拍'},
].map(p=>({...p,guide:GUIDES[p.id]||'',notice:''}));
export function completionPhoto(id,label){return {url:'/assets/completion/huagang-'+({left:'left',rear:'rear',back:'back',top:'top',inside:'detail'}[id])+'.png',name:'御碑亭 · '+label,kind:'ai-demo',accepted:false,credit:{...PILOT_SOURCE,artist:'景见 · imagegen 衍生制作；原摄影 Siyuwj',date:'2026-10-12',changes:'以实拍为参考，AI 推测补充视角；环境、文字与细节发生变化，非真实补拍。',license:'CC BY-SA 4.0'}};}
