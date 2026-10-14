import {deliveryCopies} from './content/catalog.js';
// Keep source URLs in drafts and receipts; resolve delivery copies only at display time.
const copies=new Map(deliveryCopies);
export const registerImage=(ref,objectURL)=>copies.set(ref,objectURL);
export const webImageUrl=url=>copies.get(url)||url;
