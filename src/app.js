import {createIcons,icons} from 'lucide';
import './style.css';
import './map3d/map3d.css';
import {mountScenic} from './scenic-workflow.js';
import {mountPilotWorld} from './pilot-world.js';
import {geoFor} from './geo-registry.js';
import {mountLanding} from './landing.jsx';
// Routes (?s=<scenic id>, defaults to West Lake): #home (product landing, also the default), #scenics (visitor home), #map, #spot?id=…, #pilot, #trip (&embed=1 for an iframe), #studio.
const app=document.querySelector('#app'),toastEl=document.querySelector('#toast');
let cleanup;
function toast(text){toastEl.textContent=text;toastEl.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>toastEl.classList.remove('show'),3800);}
const hydrate=()=>createIcons({icons});
// The miniature 3D map is loaded on demand; ?view=scroll keeps the illustrated 2D map.
function mountMiniature(host){
  let gone=false,inner;
  host.innerHTML='';
  import('./map3d/index.js').then(m=>{if(!gone)inner=m.mountMap3D(host,{hydrate,toast});});
  return()=>{gone=true;inner?.();};
}
function render(){
  cleanup?.();
  const [r,q]=location.hash.slice(1).split('?'),mode=['map','spot','studio','pilot','scenics','trip'].includes(r)?(r==='scenics'?'list':r):'home';
  const p=new URLSearchParams(q),miniature=mode==='map'&&p.get('view')!=='scroll'&&Boolean(geoFor(p.get('s')||'westlake'));
  app.className='route-'+(miniature?'map3d':mode);
  cleanup=mode==='home'?mountLanding(app):mode==='pilot'?mountPilotWorld(app,{hydrate}):miniature?mountMiniature(app):mountScenic(app,{mode,hydrate,toast});
  hydrate();window.scrollTo(0,0);
}
addEventListener('hashchange',render);
render();
