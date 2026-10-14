const C="forma-v8",M="forma-media";const A=["./", "./index.html", "./three.min.js", "./manifest.json", "./icon-180.png", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./icon-32.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(A)).then(()=>self.skipWaiting()));});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C&&k!==M).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
async function media(req){const u=new URL(req.url);u.search="";const key=u.href;const mc=await caches.open(M);let full=await mc.match(key);
 if(!full){const r=await fetch(key);if(!r.ok)return r;await mc.put(key,r.clone());full=r;}
 const range=req.headers.get("range");if(!range)return full;
 const buf=await full.arrayBuffer();const m=/bytes=(\d*)-(\d*)/.exec(range);const n=buf.byteLength;
 let s=m&&m[1]?+m[1]:0,en=m&&m[2]?+m[2]:n-1;if(m&&!m[1]&&m[2]){s=Math.max(0,n-+m[2]);en=n-1;}en=Math.min(en,n-1);
 return new Response(buf.slice(s,en+1),{status:206,headers:{"Content-Type":full.headers.get("Content-Type")||"video/mp4","Content-Range":"bytes "+s+"-"+en+"/"+n,"Content-Length":String(en-s+1),"Accept-Ranges":"bytes"}});}
self.addEventListener("fetch",e=>{if(e.request.method!=="GET")return;const u=new URL(e.request.url);if(u.origin!==location.origin)return;
if(e.request.mode==="navigate"){e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(C).then(x=>x.put("./index.html",c));return r;}).catch(()=>caches.match("./index.html")));return;}
if(/\/videos\/index\.json$/.test(u.pathname)){e.respondWith(fetch(e.request,{cache:"no-store"}).then(r=>{if(r.ok){const c=r.clone();caches.open(M).then(x=>x.put(u.origin+u.pathname,c));}return r;}).catch(()=>caches.match(u.origin+u.pathname)));return;}
if(/\/videos\/[^/]+\.(mp4|jpg)$/.test(u.pathname)){e.respondWith(media(e.request).catch(()=>new Response("",{status:504})));return;}
e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{const cp=res.clone();caches.open(C).then(c=>c.put(e.request,cp));return res;})));});
