import manifest from '../public/assets/web/manifest.json' with {type:'json'};

// Resolve our bundled images to delivery copies, and stored uploads ('idb:…') to object URLs. External URLs stay intact.
// Keep source URLs in saved drafts so provenance and pilot bindings remain stable.
const copies=new Map(manifest.entries.map(entry=>[entry.source,entry.output]));
export const registerImage=(ref,objectURL)=>copies.set(ref,objectURL);
export const webImageUrl=url=>copies.get(url)||url;
