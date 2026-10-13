import {createIcons,icons} from 'lucide';
import './style.css';
import {mountScenic} from './scenic-workflow.js';
import {mountPilotWorld} from './pilot-world.js';
import {mountLanding} from './landing.jsx';
// Routes (?s=<scenic id>, defaults to West Lake): #home (product landing, also the default), #scenics (visitor home), #map, #spot?id=…, #pilot, #studio.
const app=document.querySelector('#app'),toastEl=document.querySelector('#toast');
let cleanup;
function toast(text){toastEl.textContent=text;toastEl.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>toastEl.classList.remove('show'),3800);}
const hydrate=()=>createIcons({icons});
function render(){
  cleanup?.();
  const r=location.hash.slice(1).split('?')[0],mode=['map','spot','studio','pilot','scenics'].includes(r)?(r==='scenics'?'list':r):'home';
  app.className='route-'+mode;
  cleanup=mode==='home'?mountLanding(app):mode==='pilot'?mountPilotWorld(app,{hydrate}):mountScenic(app,{mode,hydrate,toast});
  hydrate();window.scrollTo(0,0);
}
addEventListener('hashchange',render);
render();
