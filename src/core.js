// Trust-boundary helpers: every staff- or user-entered string goes through these before reaching HTML or a link.
export const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function safeURL(s){try{const u=new URL(s);return ['https:','http:'].includes(u.protocol)?u.href:''}catch{return ''}}
