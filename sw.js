const V='bt-v4',CORE=['./','index.html','app.js','worker.js','manifest.webmanifest','icon-192.png','icon-512.png','icon.svg'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(CORE)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
function db(){return new Promise((ok,ko)=>{const r=indexedDB.open('bt',1);r.onupgradeneeded=()=>{r.result.createObjectStore('queue',{keyPath:'id',autoIncrement:true});r.result.createObjectStore('kv')};r.onsuccess=()=>ok(r.result);r.onerror=()=>ko(r.error)})}
function parseName(n){n=n||'';let m;
 if(m=n.match(/(?:PTT|AUD)-(\d{4})(\d{2})(\d{2})-WA(\d+)/i))return{date:`${m[1]}-${m[2]}-${m[3]}`,title:`Áudio WhatsApp ${m[3]}/${m[2]}/${m[1]} #${+m[4]}`};
 if(m=n.match(/WhatsApp (?:Audio|Ptt|Áudio|Voice)[^\d]*(\d{4})-(\d{2})-(\d{2})(?: at | às |[ _])(\d{1,2})[.:h](\d{2})/i))return{date:`${m[1]}-${m[2]}-${m[3]}T${m[4].padStart(2,'0')}:${m[5]}`,title:`Áudio WhatsApp ${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`};
 return{date:'',title:n.replace(/\.[a-z0-9]+$/i,'')||'Áudio'}}
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);
 if(e.request.method==='POST'&&u.pathname.endsWith('/share-target')){e.respondWith((async()=>{
  try{const f=await e.request.formData();const files=[...f.getAll('audio'),...[...f.values()].filter(v=>v instanceof File&&!f.getAll('audio').includes(v))].filter(v=>v instanceof File&&v.size);
   const d=await db();const model=null;
   await new Promise((ok,ko)=>{const t=d.transaction('queue','readwrite'),s=t.objectStore('queue');
    for(const file of files){const p=parseName(file.name);s.put({blob:file,name:file.name||'áudio',title:p.title,sender:'',dateAudio:p.date,status:'aguardando',model,added:Date.now()})}
    t.oncomplete=ok;t.onerror=()=>ko(t.error)});
  }catch(err){}
  return Response.redirect('./?shared=1',303)})());return}
 if(e.request.method!=='GET'||u.origin!==location.origin)return;
 e.respondWith(fetch(e.request).then(r=>{const cp=r.clone();caches.open(V).then(c=>c.put(e.request,cp));return r}).catch(()=>caches.match(e.request,{ignoreSearch:true})))});
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>{for(const c of cs)if('focus'in c)return c.focus();return clients.openWindow('./')}))});
