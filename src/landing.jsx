import {useRef,useState,useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {motion,MotionConfig,useScroll,useTransform,useSpring,useMotionValue,useMotionValueEvent,useVelocity,useAnimationFrame,useInView,useReducedMotion,useMotionTemplate,animate} from 'motion/react';
import {ReactLenis,useLenis} from 'lenis/react';
import 'lenis/dist/lenis.css';
import {ArrowRight,ArrowUpRight,Map as MapIcon,Box,Images,MessageSquareText,Upload,ScanEye,Send,Compass,LayoutDashboard,Sparkles,MapPinned,Move3d,Camera} from 'lucide-react';
import {webImageUrl as img} from './web-images.js';
import {PLACES,GUIDE_SEED} from './scenic-places.js';
import {stepRange,activeStep} from './landing-motion.js';
import sources from '../public/assets/real/sources.json' with {type:'json'};
import './landing.css';

// Product landing page (#home, also the default). React + Motion for scroll-linked animation, Lenis for smooth scrolling.
// The rest of the app stays vanilla; this module owns its own React root and tears it down on route change.
const VISIT='#scenics',STUDIO='#studio',PILOT='#pilot?s=westlake&id=huagang';
const EASE=[.2,.7,.1,1];
const spotHref=id=>id==='huagang'?PILOT:'#spot?s=westlake&id='+encodeURIComponent(id);
const VIEWS=[['正面 · 实拍','/assets/real/huagang.jpg'],['左侧','/assets/completion/huagang-left.png'],['右后','/assets/completion/huagang-rear.png'],['背面','/assets/completion/huagang-back.png'],['俯视','/assets/completion/huagang-top.png'],['近景','/assets/completion/huagang-detail.png']];
const STEPS=[
  [Camera,'01 · 采集','一张实拍，就是起点','景区在维护端上传景点照片，标明来源与许可。正面、两侧、背面、俯视、近景，六个视角逐一审核。'],
  [Sparkles,'02 · 补全','缺的视角，先补出来','AI 参照实拍推测补图，明确标注为“AI 补全”。接受或移除，由景区说了算。'],
  [Move3d,'03 · 漫游','从照片，走进空间','御碑亭已由一张正面实拍生成真实三维世界：环顾、移动、升降，漫游范围由景区逐方向设定。'],
  [MessageSquareText,'04 · 讲解','每一句讲解，都有来处','AI 导游只按景区填写的资料逐句检索作答，查不到就如实说明，不编造。'],
];
const N=STEPS.length;
const GUIDE_ANSWER=GUIDE_SEED.huagang.split('。')[2]+'。';
const reveal=(delay=0)=>({initial:{opacity:0,y:48},whileInView:{opacity:1,y:0},viewport:{once:true,amount:.2},transition:{duration:1.1,ease:EASE,delay}});
const rise=delay=>({initial:{opacity:0,y:24},animate:{opacity:1,y:0},transition:{duration:1,ease:EASE,delay}});

function Nav(){
  const lenis=useLenis(),{scrollY,scrollYProgress}=useScroll(),[solid,setSolid]=useState(false);
  useMotionValueEvent(scrollY,'change',y=>setSolid(y>40));
  const go=target=>lenis?lenis.scrollTo(target,{duration:1.6}):document.querySelector(target)?.scrollIntoView();
  const home=e=>{if(['','#home'].includes(location.hash)){e.preventDefault();lenis?.scrollTo(0,{duration:1.6});}};
  return <header className={'lp-nav'+(solid?' is-solid':'')}>
    <motion.div className="lp-progress" style={{scaleX:scrollYProgress}}/>
    <a className="lp-brand" href="#home" onClick={home} aria-label="景见首页"><img src="/favicon.svg" alt=""/><span>景见<small>JINGJIAN</small></span></a>
    <nav aria-label="页面导航">{[['#lp-story','如何运作'],['#lp-places','景点'],['#lp-portals','两端入口']].map(([t,l])=><button key={t} onClick={()=>go(t)}>{l}</button>)}</nav>
    <div className="lp-nav-cta"><a className="lp-btn ghost" href={STUDIO}>景区维护端</a><a className="lp-btn solid" href={VISIT}>开始游览<ArrowRight/></a></div>
  </header>;
}

function Chars({text,delay}){
  return [...text].map((c,i)=><motion.span key={i} className="lp-char" initial={{opacity:0,y:'70%',rotate:6,filter:'blur(10px)'}} animate={{opacity:1,y:'0%',rotate:0,filter:'blur(0px)'}} transition={{duration:1.2,ease:EASE,delay:delay+i*.11}}>{c}</motion.span>);
}

function Hero({still}){
  const lenis=useLenis(),ref=useRef(null),{scrollYProgress:p}=useScroll({target:ref,offset:['start start','end start']});
  const bgY=useTransform(p,[0,1],['0%',still?'0%':'28%']),textY=useTransform(p,[0,1],[0,still?0:-140]),fade=useTransform(p,[0,.65],[1,0]);
  // Pointer drift: background and floating card move in opposite directions for depth.
  const mx=useMotionValue(0),my=useMotionValue(0),sx=useSpring(mx,{stiffness:50,damping:18}),sy=useSpring(my,{stiffness:50,damping:18});
  const imgX=useTransform(sx,v=>v*-24),imgY=useTransform(sy,v=>v*-16),cardX=useTransform(sx,v=>v*18),cardY=useTransform(sy,v=>v*12);
  const move=e=>{if(still)return;const r=e.currentTarget.getBoundingClientRect();mx.set((e.clientX-r.left)/r.width-.5);my.set((e.clientY-r.top)/r.height-.5);};
  return <section className="lp-hero" ref={ref} onPointerMove={move}>
    <motion.div className="lp-hero-bg" style={{y:bgY}}>
      <motion.img src={img('/assets/real/huagang.jpg')} alt="" fetchPriority="high" style={{x:imgX,y:imgY}} initial={{scale:1.28,filter:'brightness(.55) saturate(.7)'}} animate={{scale:1.1,filter:'brightness(1) saturate(1)'}} transition={{duration:3.2,ease:EASE}}/>
    </motion.div>
    <div className="lp-hero-shade"/>
    <motion.div className="lp-hero-vertical" aria-hidden="true" initial={{opacity:0}} animate={{opacity:1}} transition={{duration:2,delay:1.6}}>西湖十景 · 花港观鱼</motion.div>
    <motion.div className="lp-hero-inner" style={{y:textY,opacity:fade}}>
      <motion.p className="lp-eyebrow" {...rise(.1)}>景区数字预览 · 黑客松原型</motion.p>
      <h1 aria-label="与山水先相遇"><span className="lp-line" aria-hidden="true"><Chars text="与山水" delay={.25}/></span><span className="lp-line" aria-hidden="true"><Chars text="先相遇" delay={.58}/></span></h1>
      <motion.p className="lp-lead" {...rise(.95)}>把景点照片与讲解资料，整理成游客可以浏览、提问、走进去的景区预览。</motion.p>
      <motion.div className="lp-cta" {...rise(1.1)}><a className="lp-btn solid lg" href={VISIT}><Compass/>我是游客 · 去看看</a><a className="lp-btn glass lg" href={STUDIO}><LayoutDashboard/>我是景区 · 进维护端</a></motion.div>
    </motion.div>
    <motion.a className="lp-hero-card" href={PILOT} style={{x:cardX,y:cardY,opacity:fade}} initial={{opacity:0,y:40}} animate={{opacity:1,y:0}} transition={{duration:1.2,ease:EASE,delay:1.35}} whileHover={{scale:1.03}}>
      <img src={img('/assets/completion/huagang-top.png')} alt=""/><div><small>真实三维试点</small><b>御碑亭 · 3D 漫游</b><span>进入<ArrowUpRight/></span></div>
    </motion.a>
    <button className="lp-scroll" onClick={()=>lenis?.scrollTo('#lp-story',{duration:1.6})} aria-label="向下浏览"><span/></button>
  </section>;
}

// Endless strip whose speed follows scroll velocity and flips with scroll direction.
function Marquee({still}){
  const ref=useRef(null),x=useMotionValue(0),dir=useRef(1),{scrollY}=useScroll();
  const vel=useSpring(useVelocity(scrollY),{damping:50,stiffness:400}),boost=useTransform(vel,[-2000,0,2000],[-5,0,5],{clamp:false});
  useAnimationFrame((_,dt)=>{
    if(still||!ref.current)return;
    const b=boost.get(),w=ref.current.scrollWidth/2;if(b)dir.current=Math.sign(b);
    const v=x.get()-dir.current*(36+Math.abs(b)*36)*dt/1000;x.set(((v%w)-w)%w);
  });
  const items=PLACES.map(p=><span key={p.id}>{p.name}<i>◆</i></span>);
  return <div className="lp-marquee" aria-hidden="true"><motion.div ref={ref} style={{x}}>{items}{items}</motion.div></div>;
}

const useStep=(p,i)=>{const [xs,ys]=stepRange(i,N);return useTransform(p,xs,ys);};
function Frame({p,i,className='',children}){
  const o=useStep(p,i),s=useTransform(o,[0,1],[1.06,1]);
  return <motion.div className={'lp-frame '+className} style={{opacity:o,scale:s}}>{children}</motion.div>;
}
// The six review views fly out of one stacked pile into their grid cells while step 2 scrolls by.
function Tile({p,i,name,url}){
  const c=i%3,r=Math.floor(i/3),q=useTransform(p,[1/N-.03+i*.014,1/N+.1+i*.014],[0,1]);
  const x=useTransform(q,[0,1],[`${(1-c)*100}%`,'0%']),y=useTransform(q,[0,1],[`${(.5-r)*100}%`,'0%']),rotate=useTransform(q,[0,1],[(i-2.5)*5,0]),scale=useTransform(q,[0,1],[.82,1]);
  return <motion.figure style={{x,y,rotate,scale,zIndex:6-i}}><img src={img(url)} alt=""/><figcaption>{name}{i?<em>AI</em>:null}</figcaption></motion.figure>;
}
function StepText({p,i,step:[Icon,k,t,d]}){
  const [xs,ys]=stepRange(i,N),o=useTransform(p,xs,ys),y=useTransform(p,xs,ys.map((v,j)=>v?0:j?-40:40));
  return <motion.li className="lp-step" style={{opacity:o,y}}><span className="lp-step-k"><Icon/>{k}</span><h2>{t}</h2><p>{d}</p></motion.li>;
}
function Story({still}){
  const ref=useRef(null),{scrollYProgress:p}=useScroll({target:ref,offset:['start start','end end']}),[active,setActive]=useState(0);
  useMotionValueEvent(p,'change',v=>setActive(activeStep(v,N)));
  const photoScale=useTransform(p,[0,1/N],[1.14,1]);
  const panX=useTransform(p,[2/N,3/N],still?['0%','0%']:['-7%','7%']),panR=useTransform(p,[2/N,3/N],still?[0,0]:[-6,6]);
  const me=useTransform(p,[3/N-.01,3/N+.05],[0,1]),ai=useTransform(p,[3/N+.06,3/N+.13],[0,1]);
  const meY=useTransform(me,[0,1],[18,0]),aiY=useTransform(ai,[0,1],[18,0]);
  return <section className="lp-story" id="lp-story" ref={ref}>
    <div className="lp-story-pin">
      <div className="lp-stage" aria-hidden="true">
        <Frame p={p} i={0}><motion.img src={img('/assets/real/huagang.jpg')} alt="" style={{scale:photoScale}}/><div className="lp-chip-row"><span className="lp-chip"><Upload/>正面实拍</span><span className="lp-chip gold">待审核</span></div><div className="lp-scanline"/></Frame>
        <Frame p={p} i={1}><div className="lp-views">{VIEWS.map(([n,u],i)=><Tile key={i} p={p} i={i} name={n} url={u}/>)}</div></Frame>
        <Frame p={p} i={2} className="lp-world"><motion.img src={img('/assets/completion/huagang-left.png')} alt="" style={{x:panX,rotateY:panR}}/><div className="lp-hud">{['W','A','S','D'].map(k=><span key={k}>{k}</span>)}<small>环顾 · 移动 · 升降</small></div><span className="lp-chip lp-demo">界面示意</span></Frame>
        <Frame p={p} i={3} className="lp-chat-frame"><img src={img('/assets/real/huagang.jpg')} alt=""/><div className="lp-chat"><motion.p className="me" style={{opacity:me,y:meY}}>御碑亭上的字是谁写的？</motion.p><motion.p className="ai" style={{opacity:ai,y:aiY}}>{GUIDE_ANSWER}<small>出自景区讲解资料</small></motion.p></div></Frame>
      </div>
      <div className="lp-story-text">
        <div className="lp-rail" aria-hidden="true"><motion.span style={{scaleY:p}}/></div>
        <ol>{STEPS.map((s,i)=><StepText key={i} p={p} i={i} step={s}/>)}</ol>
        <div className="lp-dots" aria-hidden="true">{STEPS.map((_,i)=><span key={i} className={i===active?'on':''}/>)}</div>
      </div>
    </div>
  </section>;
}

function Places(){
  return <section className="lp-section" id="lp-places">
    <motion.div className="lp-head" {...reveal()}><p className="lp-eyebrow">首个景区 · 杭州西湖</p><h2>六处实景，<br/>先在屏幕上走一遍</h2><a className="lp-link" href="#map?s=westlake">打开景区地图<ArrowRight/></a></motion.div>
    <div className="lp-place-grid">{PLACES.map((p,i)=>{const src=sources[p.id];return <motion.a key={p.id} className="lp-place" href={spotHref(p.id)} {...reveal((i%3)*.08)} whileHover={{y:-8,transition:{duration:.5,ease:EASE}}}>
      <div className="lp-place-img"><img src={img(src.path)} alt={p.name} loading="lazy"/></div>
      <div className="lp-place-body"><span>{String(i+1).padStart(2,'0')}</span><h3>{p.name}</h3><p>{p.description}</p><small>{src.artist} · {src.license}</small></div>
      {p.id==='huagang'&&<em className="lp-badge"><Box/>3D 漫游</em>}
    </motion.a>;})}</div>
  </section>;
}

// Card tilts toward the pointer, with a soft light that follows it.
function Portal({href,kind,bg,label,Icon,title,items,go,delay,still}){
  const mx=useMotionValue(.5),my=useMotionValue(.5),cfg={stiffness:120,damping:16};
  const rx=useSpring(useTransform(my,[0,1],still?[0,0]:[6,-6]),cfg),ry=useSpring(useTransform(mx,[0,1],still?[0,0]:[-8,8]),cfg);
  const glow=useMotionTemplate`radial-gradient(520px circle at ${useTransform(mx,v=>v*100)}% ${useTransform(my,v=>v*100)}%, #d3b37533, transparent 60%)`;
  const move=e=>{const r=e.currentTarget.getBoundingClientRect();mx.set((e.clientX-r.left)/r.width);my.set((e.clientY-r.top)/r.height);};
  return <motion.div className="lp-portal-wrap" {...reveal(delay)}>
    <motion.a className={'lp-portal '+kind} href={href} onPointerMove={move} onPointerLeave={()=>{mx.set(.5);my.set(.5);}} style={{rotateX:rx,rotateY:ry}}>
      <div className="lp-portal-bg"><img src={img(bg)} alt="" loading="lazy"/></div>
      <motion.div className="lp-portal-glow" style={{background:glow}}/>
      <div className="lp-portal-body"><span className="lp-portal-k"><Icon/>{label}</span><h3>{title[0]}<br/>{title[1]}</h3><ul>{items.map(([I,t])=><li key={t}><I/>{t}</li>)}</ul><span className="lp-portal-go">{go}<ArrowRight/></span></div>
    </motion.a>
  </motion.div>;
}
function Portals({still}){
  return <section className="lp-section lp-portals" id="lp-portals">
    <motion.div className="lp-head" {...reveal()}><p className="lp-eyebrow">两端，一份内容</p><h2>景区编辑一次，<br/>游客处处可见</h2></motion.div>
    <div className="lp-portal-grid">
      <Portal still={still} delay={0} href={VISIT} kind="visitor" bg="/assets/scenic/garden-map.png" label="游客端" Icon={Compass} title={['挑一处风景，','按自己的节奏看']} go="开始游览" items={[[MapIcon,'插画地图选景点，就地预览'],[Images,'实景照片，附来源与许可'],[Box,'实拍生成的 3D 空间漫游'],[MessageSquareText,'只依据景区资料作答的 AI 导游']]}/>
      <Portal still={still} delay={.12} href={STUDIO} kind="studio" bg="/assets/completion/huagang-detail.png" label="景区维护端" Icon={LayoutDashboard} title={['地图、照片、讲解，','一处管理']} go="进入维护端" items={[[MapPinned,'上传地图，拖放景点位置'],[ScanEye,'六视角审核，接受或移除 AI 补图'],[Move3d,'逐方向调整 3D 漫游范围'],[Send,'草稿与发布分离，一键发布']]}/>
    </div>
  </section>;
}

function Count({to}){
  const ref=useRef(null),inView=useInView(ref,{once:true,amount:.6}),[n,setN]=useState(0);
  useEffect(()=>{if(!inView)return;const c=animate(0,to,{duration:1.4,ease:EASE,onUpdate:v=>setN(Math.round(v))});return()=>c.stop();},[inView,to]);
  return <b ref={ref}>{n}</b>;
}
function Stats(){
  const rows=[[6,'处西湖实景','附作者与许可'],[6,'个审核视角','正面 · 两侧 · 背面 · 俯视 · 近景'],[1,'个真实三维试点','由一张实拍生成'],[0,'次上传服务器','草稿保存在本机浏览器']];
  return <section className="lp-stats">{rows.map(([n,t,s],i)=><motion.div key={t} className="lp-stat" {...reveal(i*.09)}><Count to={n}/><span>{t}</span><small>{s}</small></motion.div>)}</section>;
}

function Final({still}){
  const ref=useRef(null),{scrollYProgress:p}=useScroll({target:ref,offset:['start end','end start']});
  const y=useTransform(p,[0,1],still?['0%','0%']:['-12%','12%']),scale=useTransform(p,[0,.5],[.9,1]);
  return <section className="lp-final" ref={ref}>
    <motion.div className="lp-final-bg" style={{y}}><img src={img('/assets/real/duanqiao.jpg')} alt="" loading="lazy"/></motion.div>
    <motion.div className="lp-final-inner" style={{scale}}><h2>出发之前，<br/>先见一面。</h2><div className="lp-cta"><a className="lp-btn solid lg" href={VISIT}><Compass/>开始游览</a><a className="lp-btn glass lg" href={STUDIO}><LayoutDashboard/>景区维护端</a></div></motion.div>
  </section>;
}

function Landing(){
  const still=!!useReducedMotion();
  return <ReactLenis root options={{lerp:.09,respectReducedMotion:true}}>
    <MotionConfig reducedMotion="user">
      <Nav/>
      <main className="lp"><Hero still={still}/><Marquee still={still}/><Story still={still}/><Places/><Portals still={still}/><Stats/><Final still={still}/></main>
      <footer className="lp-foot"><span>景见 · 名称暂定 · 2026 黑客松原型</span><span>照片来自 Wikimedia Commons，作者与许可见各景点详情；AI 补图已标注。地图为插画，非地理导航。</span><a href="/THIRD_PARTY_LICENSES.txt" target="_blank" rel="noopener">第三方许可</a></footer>
    </MotionConfig>
  </ReactLenis>;
}

export function mountLanding(host){
  host.replaceChildren();
  const root=createRoot(host);root.render(<Landing/>);
  return()=>root.unmount();
}
