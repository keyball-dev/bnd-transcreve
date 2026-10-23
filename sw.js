const V='bt-v1',CORE=['./','index.html','app.js','worker.js','manifest.webmanifest','icon-192.png','icon-512.png','icon.svg'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(CORE)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V&&k!=='bt-share').map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);
 if(e.request.method==='POST'&&u.pathname.endsWith('/share-target')){e.respondWith((async()=>{
  try{const f=await e.request.formData();const file=f.get('audio')||[...f.values()].find(v=>v instanceof File);
   if(file){const c=await caches.open('bt-share');await c.put('./shared-audio',new Response(file,{headers:{'Content-Type':file.type||'audio/ogg','X-Name':encodeURIComponent(file.name||'audio')}}));}
  }catch(err){}
  return Response.redirect('./?shared=1',303)})());return}
 if(e.request.method!=='GET'||u.origin!==location.origin)return;
 e.respondWith(fetch(e.request).then(r=>{const cp=r.clone();caches.open(V).then(c=>c.put(e.request,cp));return r}).catch(()=>caches.match(e.request,{ignoreSearch:true})))});
