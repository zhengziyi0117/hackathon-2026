// Visitor check-ins stay on this device: {[scenicId]: {[spotId]: ISO time}}.
const KEY='jj-stamps';
const read=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')||{};}catch{return {};}};
export const loadStamps=sid=>({...(read()[sid]||{})});
export function saveStamp(sid,id){
 const all=read();all[sid]={...(all[sid]||{}),[id]:all[sid]?.[id]||new Date().toISOString()};
 try{localStorage.setItem(KEY,JSON.stringify(all));}catch{}
 return {...all[sid]};
}
