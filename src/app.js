import {createIcons,icons} from 'lucide';
import './style.css';
import {mountScenic} from './scenic-workflow.js';
import {mountPilotWorld} from './pilot-world.js';
// Routes: #map (home, also the default), #spot?id=…, #pilot (full-screen 3D), #studio (scenic maintenance).
const app=document.querySelector('#app'),toastEl=document.querySelector('#toast');
let cleanup;
function toast(text){toastEl.textContent=text;toastEl.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>toastEl.classList.remove('show'),3800);}
const hydrate=()=>createIcons({icons});
function render(){
  cleanup?.();
  const r=location.hash.slice(1).split('?')[0],mode=['spot','studio','pilot'].includes(r)?r:'map';
  app.className='route-'+mode;
  cleanup=mode==='pilot'?mountPilotWorld(app,{hydrate}):mountScenic(app,{mode,hydrate,toast});
  hydrate();window.scrollTo(0,0);
}
addEventListener('hashchange',render);
render();
