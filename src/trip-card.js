// Itinerary card shared by the studio preview, the visitor page and the iframe embed.
import {escapeHTML as e} from './core.js';
import {webImageUrl} from './web-images.js';
import {worldAsset} from './scenic-core.js';

const ic=n=>`<i data-lucide="${n}"></i>`;
const distance=m=>m>=1000?(m/1000).toFixed(1)+' 公里':m+' 米';
const duration=min=>min>=60?Math.floor(min/60)+' 小时'+(min%60?' '+min%60+' 分钟':''):min+' 分钟';
const legMode=l=>!l.boatMeters?['footprints','步行']:l.boatMeters<l.meters?['sailboat','步行 + 游船']:['sailboat','游船'];

// The route over the scenic's own water outline (G.WATER, rings combined even-odd); north is up.
export function tripMapSVG(trip,G){
 const pts=trip.legs.flatMap(l=>l.path),xs=pts.map(p=>p[0]),zs=pts.map(p=>p[1]),pad=3.5;
 const x0=Math.min(...xs)-pad,x1=Math.max(...xs)+pad,z0=Math.min(...zs)-pad,z1=Math.max(...zs)+pad;
 const water=G?.WATER?`<path class="tc-water" fill-rule="evenodd" d="${G.WATER.map(r=>'M'+r.map(([x,z])=>x+' '+z).join('L')+'Z').join('')}"/>`:'';
 const route=trip.legs.map(l=>`<polyline class="${l.boatMeters?'boat':''}" points="${l.path.map(p=>p.join(',')).join(' ')}"/>`).join('');
 const stops=trip.order.map((id,i)=>{const [x,z]=i?trip.legs[i-1].path.at(-1):trip.legs[0].path[0];return `<g transform="translate(${x} ${z})"><circle r="1.5"/><text dy=".55">${i+1}</text></g>`;}).join('');
 return `<svg class="tc-map" viewBox="${x0} ${z0} ${x1-x0} ${z1-z0}" role="img" aria-label="游览路线示意">${water}<g class="tc-route">${route}</g><g class="tc-stops">${stops}</g></svg>`;
}
// link(spot) gives where a stop leads (3D roam or photos).
export function tripCardHTML(trip,spots,{G,link,embed=false}={}){
 const byId=Object.fromEntries(spots.map(s=>[s.id,s]));
 const rows=trip.order.map((id,i)=>{
  const s=byId[id];if(!s)return '';
  const photo=s.photos?.front||Object.values(s.photos||{})[0],l=trip.legs[i],[icon,mode]=l?legMode(l):[];
  const stop=`<li class="tc-stop"><span class="tc-n">${i+1}</span>${photo?`<img src="${e(webImageUrl(photo.url))}" alt="" loading="lazy">`:'<span class="tc-noimg"></span>'}<span class="tc-name"><b>${e(s.name.split(' · ')[0])}</b><small>建议停留 ${trip.stay} 分钟${worldAsset(s)?' · 可 3D 漫游':''}</small></span>${link?`<a class="tc-go" href="${e(link(s))}" target="${embed?'_top':'_self'}" aria-label="去看${e(s.name)}">${ic(worldAsset(s)?'box':'images')}</a>`:''}</li>`;
  return stop+(l?`<li class="tc-leg ${l.boatMeters?'boat':''}">${ic(icon)}<span>${mode} ${distance(l.meters)} · 约 ${l.minutes} 分钟</span></li>`:'');
 }).join('');
 return `<article class="tc ${embed?'tc-embed':''}"><header class="tc-head"><small>景见 · 游览路线</small><h2>${e(trip.title)}</h2><p><span>${trip.order.length} 处</span><span>全程约 ${distance(trip.meters)}</span><span>约 ${duration(trip.totalMinutes)}</span></p></header><div class="tc-body">${tripMapSVG(trip,G)}<ol class="tc-list">${rows}</ol></div><footer class="tc-foot">用时按步行与游船的平均速度估算，不含候船时间；停留时间仅为建议。</footer></article>`;
}
