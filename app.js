const $=id=>document.getElementById(id);
const LS={get:(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}},set:(k,v)=>localStorage.setItem(k,JSON.stringify(v))};
if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js');
function toast(m){const t=$('toast');t.textContent=m;t.classList.add('on');clearTimeout(toast.h);toast.h=setTimeout(()=>t.classList.remove('on'),3000)}
const DEFM=LS.get('bt_default',LS.get('bt_model','onnx-community/whisper-small'));$('model').value=DEFM;$('defModel').value=DEFM;
$('defModel').onchange=()=>{LS.set('bt_default',$('defModel').value);$('model').value=$('defModel').value;toast('Modo padrão salvo')};let lastBlob=null;
// ---- IndexedDB (fila + configurações do cofre) ----
const DB=new Promise((ok,ko)=>{const r=indexedDB.open('bt',1);r.onupgradeneeded=()=>{r.result.createObjectStore('queue',{keyPath:'id',autoIncrement:true});r.result.createObjectStore('kv')};r.onsuccess=()=>ok(r.result);r.onerror=()=>ko(r.error)});
async function tx(st,mode,fn){const d=await DB;return new Promise((ok,ko)=>{const t=d.transaction(st,mode),s=t.objectStore(st);const r=fn(s);t.oncomplete=()=>ok(r&&r.result);t.onerror=()=>ko(t.error)})}
const Q={all:()=>tx('queue','readonly',s=>s.getAll()),put:v=>tx('queue','readwrite',s=>s.put(v)),del:id=>tx('queue','readwrite',s=>s.delete(id))};
const KV={get:k=>tx('kv','readonly',s=>s.get(k)),set:(k,v)=>tx('kv','readwrite',s=>s.put(v,k))};
// ---- nome do arquivo do WhatsApp -> data ----
function parseName(n){n=n||'';let m;
 if(m=n.match(/(?:PTT|AUD)-(\d{4})(\d{2})(\d{2})-WA(\d+)/i))return{date:`${m[1]}-${m[2]}-${m[3]}`,title:`Áudio WhatsApp ${m[3]}/${m[2]}/${m[1]} #${+m[4]}`};
 if(m=n.match(/WhatsApp (?:Audio|Ptt|Áudio|Voice)[^\d]*(\d{4})-(\d{2})-(\d{2})(?: at | às |[ _])(\d{1,2})[.:h](\d{2})/i))return{date:`${m[1]}-${m[2]}-${m[3]}T${m[4].padStart(2,'0')}:${m[5]}`,title:`Áudio WhatsApp ${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`};
 return{date:'',title:n.replace(/\.[a-z0-9]+$/i,'')||'Áudio'}}
const worker=new Worker('worker.js',{type:'module'});let busy=false,curName='',curItem=null,job=null;
function prog(txt,p){$('prog').classList.remove('hidden');$('st').textContent=txt;if(p!=null)$('pb').style.width=Math.min(100,p)+'%'}
worker.onmessage=e=>{const m=e.data;
 if(m.t==='dl')prog(`Baixando modelo (só na 1ª vez): ${(m.l/1e6).toFixed(0)} de ${(m.tot/1e6).toFixed(0)} MB`,m.l/m.tot*100);
 else if(m.t==='ready')window.__device=m.device;
 else if(m.t==='start')prog(`Transcrevendo ${curName}…`,2);
 else if(m.t==='tick'){const est=m.dur*(window.__device==='webgpu'?0.15:(job&&job.model.includes('small')?1.3:0.5))+3;prog(`Transcrevendo ${curName}… ${m.el.toFixed(0)} s`,Math.min(95,m.el/est*100))}
 else if(m.t==='done'){prog(`Pronto em ${m.secs.toFixed(1)} s (áudio de ${m.dur.toFixed(0)} s, ${window.__device==='webgpu'?'GPU':'CPU'})`,100);window.__last=m;job&&job.ok(m)}
 else if(m.t==='err'){prog('Erro: '+m.msg,0);job&&job.ko(new Error(m.msg))}};
const transcribe=(audio,model)=>new Promise((ok,ko)=>{job={ok,ko,model};worker.postMessage({audio,model},[audio.buffer])});
async function decode(blob){const buf=await blob.arrayBuffer();const ac=new (window.AudioContext||window.webkitAudioContext)();
 const ab=await ac.decodeAudioData(buf);ac.close();
 const len=Math.ceil(ab.duration*16000);const off=new OfflineAudioContext(1,len,16000);const src=off.createBufferSource();src.buffer=ab;src.connect(off.destination);src.start();
 const r=await off.startRendering();return r.getChannelData(0)}
async function enqueue(files,model){files=[...files].filter(f=>f&&f.size);if(!files.length)return toast('Nenhum áudio recebido');
 for(const f of files){const p=parseName(f.name);await Q.put({blob:f,name:f.name||'áudio',title:p.title,sender:'',dateAudio:p.date,status:'aguardando',model:model||$('model').value,added:Date.now()})}
 toast(files.length>1?`${files.length} áudios na fila`:'Áudio na fila');askNotify();renderQ();kick()}
function run(blob,name){enqueue([blob instanceof File?blob:new File([blob],name||'áudio',{type:blob.type})],$('model').value)}
window.__run=run;window.__enqueue=enqueue;
// wake lock
let wl=null;async function wake(on){try{if(on&&'wakeLock'in navigator&&!wl&&document.visibilityState==='visible'){wl=await navigator.wakeLock.request('screen');wl.onrelease=()=>wl=null}else if(!on&&wl){await wl.release();wl=null}}catch{}}
document.addEventListener('visibilitychange',()=>{if(busy&&document.visibilityState==='visible')wake(true)});
async function kick(){if(busy)return;busy=true;let n=0;
 try{for(;;){const items=(await Q.all()).filter(x=>x.status==='aguardando'||x.status==='transcrevendo');if(!items.length)break;
  const it=items.sort((a,b)=>a.id-b.id)[0];it.status='transcrevendo';await Q.put(it);renderQ();curItem=it;curName=it.title;lastBlob=it.blob;wake(true);$('res').classList.add('hidden');
  try{prog(`Lendo ${it.title}…`,0);const audio=await decode(it.blob);const dur=audio.length/16000;prog('Preparando modelo…',0);
   if(!it.model)it.model=$('model').value;const m=await transcribe(audio,it.model);Object.assign(it,{status:'pronto',text:m.text,dur:Math.round(dur),done:Date.now()});delete it.err;
   addHist(m.text,dur,it);show(m.text,dur);n++;await vaultAuto(it);await Q.put(it);
   const rest=(await Q.all()).filter(x=>x.status==='aguardando').length;
   if(rest&&LS.get('bt_notif_each',false))notify(`Pronto: ${it.title}`,m.text.slice(0,120));
   if(!rest)notify(n>1?`${n} transcrições prontas`:`Transcrição pronta: ${it.title}`,n>1?'Toque para abrir o Transcreve.':m.text.slice(0,120))}
  catch(err){Object.assign(it,{status:'erro',err:String(err.message||err)});await Q.put(it);prog('Erro em '+it.title+': '+it.err,0)}
  renderQ()}}
 finally{busy=false;curItem=null;wake(false);renderQ()}}
const ST={aguardando:'⏳ aguardando',transcrevendo:'🎧 transcrevendo',pronto:'✅ pronto',erro:'⚠️ erro'};
async function renderQ(){const items=(await Q.all()).sort((a,b)=>b.id-a.id),el=$('queue');$('qcard').classList.toggle('hidden',!items.length);el.innerHTML='';
 for(const it of items){const d=document.createElement('div');d.className='qi';d.dataset.id=it.id;d.dataset.st=it.status;
  d.innerHTML=`<div class="qh"><span class="qs">${ST[it.status]||it.status}</span><span class="muted">${it.dateAudio?it.dateAudio.replace('T',' '):''}${it.dur?' · '+it.dur+'s':''}${it.saved?' · 💾 cofre':''}</span></div>`;
  const t=document.createElement('input');t.value=it.title;t.placeholder='Título';t.className='qt';const s=document.createElement('input');s.value=it.sender||'';s.placeholder='Remetente (opcional)';s.className='qr';
  const sv=async()=>{const all=await Q.all();const x=all.find(y=>y.id===it.id);if(!x)return;x.title=t.value.trim()||x.title;x.sender=s.value.trim();await Q.put(x);
   const h=LS.get('bt_hist',[]);const hi=h.find(y=>y.qid===x.id);if(hi){hi.n=x.title;hi.s=x.sender;LS.set('bt_hist',h);renderHist()}};t.onchange=sv;s.onchange=sv;
  const r=document.createElement('div');r.className='row';
  if(it.status==='pronto'){const v=document.createElement('button');v.textContent='Ver';v.onclick=()=>{curName=it.title;curItem=it;lastBlob=it.blob;show(it.text,it.dur)};r.append(v)}
  if(it.status==='erro'){const v=document.createElement('button');v.textContent='Tentar de novo';v.onclick=async()=>{it.status='aguardando';await Q.put(it);renderQ();kick()};r.append(v)}
  if(it.status!=='transcrevendo'){const x=document.createElement('button');x.textContent='Remover';x.onclick=async()=>{await Q.del(it.id);renderQ()};r.append(x)}
  if(it.err){const e=document.createElement('div');e.className='muted';e.textContent=it.err;d.append(e)}
  d.append(t,s,r);el.append(d)}}
$('qclr').onclick=async()=>{for(const x of await Q.all())if(x.status==='pronto')await Q.del(x.id);renderQ()};
$('pick').onclick=()=>$('file').click();$('file').onchange=e=>{enqueue(e.target.files);e.target.value=''};
// notificações
async function askNotify(){if(!('Notification'in window)||Notification.permission!=='default'||LS.get('bt_notif_asked',false))return;$('ncard').classList.remove('hidden')}
$('nYes').onclick=async()=>{LS.set('bt_notif_asked',true);$('ncard').classList.add('hidden');const p=await Notification.requestPermission();toast(p==='granted'?'Aviso ativado':'Sem avisos (dá pra ativar depois no navegador)')};
$('nNo').onclick=()=>{LS.set('bt_notif_asked',true);$('ncard').classList.add('hidden')};
async function notify(title,body){if(!('Notification'in window)||Notification.permission!=='granted')return;if(document.visibilityState==='visible'&&document.hasFocus()&&!LS.get('bt_notif_always',false))return;
 try{const r=await navigator.serviceWorker.ready;await r.showNotification(title,{body,icon:'icon-192.png',badge:'icon-192.png',tag:'bt-'+Date.now(),data:{url:'./'}})}catch{}}
window.__notify=notify;
// share target: arquivos já estão na fila (gravados pelo service worker)
(async()=>{if(location.search.includes('shared')){history.replaceState(null,'',location.pathname);const n=(await Q.all()).filter(x=>x.status==='aguardando').length;if(n)toast(n>1?`${n} áudios recebidos`:'Áudio recebido');askNotify()}
 renderQ();kick()})();
// ---- cofre (pasta no PC via File System Access) ----
const FS='showDirectoryPicker'in window;$('vault').classList.toggle('hidden',!FS);
$('vSub').value=LS.get('bt_vsub','05 Pesquisa/Transcrições');$('vAuto').checked=LS.get('bt_vauto',true);
$('vSub').onchange=()=>LS.set('bt_vsub',$('vSub').value.trim());$('vAuto').onchange=()=>LS.set('bt_vauto',$('vAuto').checked);
async function vInfo(){const h=await KV.get('vault').catch(()=>null);$('vName').textContent=h?`Pasta: ${h.name} › ${$('vSub').value||'(raiz)'}`:'Nenhuma pasta escolhida';$('vSave').classList.toggle('hidden',!h||!FS);return h}
$('vPick').onclick=async()=>{try{const h=await showDirectoryPicker({id:'bt-cofre',mode:'readwrite',startIn:'documents'});await KV.set('vault',h);vInfo();toast('Pasta do cofre salva')}catch(e){if(e.name!=='AbortError')toast('Não consegui usar essa pasta')}};
async function perm(h,ask){if(!h.queryPermission)return true;const o={mode:'readwrite'};if(await h.queryPermission(o)==='granted')return true;return ask?(await h.requestPermission(o))==='granted':false}
const localISO=d=>{const o=-d.getTimezoneOffset(),p=n=>String(Math.floor(Math.abs(n))).padStart(2,'0');return new Date(d.getTime()+o*6e4).toISOString().slice(0,19)+(o>=0?'+':'-')+p(o/60)+':'+p(o%60)};
const yq=v=>JSON.stringify(v==null?'':String(v));
function md(it){const now=new Date(it.done||Date.now());return `---\ntitulo: ${yq(it.title)}\nremetente: ${yq(it.sender)}\ndata_audio: ${yq(it.dateAudio)}\ndata_transcricao: ${yq(localISO(now))}\nduracao: ${it.dur||0}\nmodelo: ${yq((it.model||'').split('/').pop())}\norigem: bnd-transcreve\ntags: [transcricao]\n---\n\n# ${it.title}\n\n${(it.text||'').trim()}\n`}
const fname=it=>{const d=it.dateAudio||new Date(it.done||Date.now()).toISOString().slice(0,16);return (d.replace('T',' ').replace(':','h')+' - '+it.title).replace(/[\\/:*?"<>|]/g,'-').slice(0,120)+'.md'};
async function vWrite(it,ask){const h=await KV.get('vault');if(!h)throw new Error('Escolha a pasta do cofre em Configurações');if(!await perm(h,ask))throw new Error('perm');
 let d=h;for(const p of ($('vSub').value||'').split(/[\\/]/).map(x=>x.trim()).filter(Boolean))d=await d.getDirectoryHandle(p,{create:true});
 const fh=await d.getFileHandle(fname(it),{create:true});const w=await fh.createWritable();await w.write(md(it));await w.close();it.saved=fname(it);return it.saved}
async function vaultAuto(it){if(!$('vAuto').checked||!(await KV.get('vault').catch(()=>null)))return;
 try{await vWrite(it,false)}catch(e){if(e.message==='perm'){$('vPerm').classList.remove('hidden');it.pendingSave=true}}}
$('vPerm').onclick=async()=>{const h=await KV.get('vault');if(!h||!await perm(h,true))return toast('Permissão negada');$('vPerm').classList.add('hidden');
 let n=0;for(const x of await Q.all())if(x.pendingSave&&x.status==='pronto'){await vWrite(x,false);delete x.pendingSave;await Q.put(x);n++}toast(`${n} salvo(s) no cofre`);renderQ()};
$('vSave').onclick=async()=>{const it=curItem&&curItem.text!=null?curItem:{title:curName,sender:'',dateAudio:'',text:$('txt').value,model:$('model').value,dur:0};it.text=$('txt').value;
 try{const n=await vWrite(it,true);if(it.id)await Q.put(it);toast('Salvo no cofre: '+n);renderQ()}catch(e){toast(e.message==='perm'?'Permissão negada':e.message)}};
window.__vWrite=vWrite;window.__KV=KV;vInfo();

function show(t,dur){$('res').classList.remove('hidden');$('txt').value=t;$('rt').textContent='Transcrição · '+curName;gemUI();hint(t,dur);$('res').scrollIntoView({behavior:'smooth'})}
function hint(t,dur){const h=$('hint');h.innerHTML='';if(!lastBlob||$('model').value.includes('small'))return;
 const w=t.split(/\s+/).filter(Boolean),rep=w.length>8&&new Set(w.map(x=>x.toLowerCase())).size/w.length<0.4,thin=dur&&w.length/dur<0.8;
 h.append((rep||thin?'O texto parece incompleto. ':'Texto com erros? ')+'Tente o modo ');const a=document.createElement('a');a.textContent='Mais preciso';
 a.onclick=()=>{$('model').value='onnx-community/whisper-small';run(lastBlob,curName)};h.append(a,' (mais lento).')}
function text(){const p=LS.get('bt_pref','').trim();const t=$('txt').value.trim();return p?p+'\n'+t:t}
async function copy(t){try{await navigator.clipboard.writeText(t);return true}catch{const a=document.createElement('textarea');a.value=t;document.body.appendChild(a);a.select();const ok=document.execCommand('copy');a.remove();return ok}}
$('copy').onclick=async()=>toast(await copy($('txt').value)?'Texto copiado':'Não consegui copiar');
$('share').onclick=async()=>{if(navigator.share){try{await navigator.share({text:$('txt').value})}catch{}}else{await copy($('txt').value);toast('Compartilhar indisponível, texto copiado')}};
// IA
const IA={grok:{n:'Grok',neu:q=>'https://grok.com/?q='+encodeURIComponent(q),hosts:['grok.com','x.com'],ex:'grok.com/c/<id>'},
 gemini:{n:'Gemini',neu:()=>'https://gemini.google.com/app',hosts:['gemini.google.com','g.co'],ex:'gemini.google.com/app/<id>'},
 chatgpt:{n:'ChatGPT',neu:q=>'https://chatgpt.com/?q='+encodeURIComponent(q),hosts:['chatgpt.com'],ex:'chatgpt.com/c/<id>'}};
const links=LS.get('bt_links',{});if(LS.get('bt_gem','')&&!links.gemini){links.gemini=LS.get('bt_gem','');LS.set('bt_links',links)}
let ia=LS.get('bt_ia','grok');if(!IA[ia])ia='grok';
function check(u,k){let x;try{x=new URL(u.trim())}catch{return 'Link inválido.'}
 if(x.protocol!=='https:'||!IA[k].hosts.some(h=>x.hostname===h||x.hostname==='www.'+h))return `Esse link não é do ${IA[k].n} (${IA[k].hosts.join(' ou ')}).`;
 if(/\/share\//.test(x.pathname))return 'Esse é um link público de “Compartilhar”: ele cria uma cópia e não continua a conversa. Abra a conversa no Chrome e copie o endereço da barra.';
 return ''}
function gemUI(){document.querySelectorAll('#iaSeg button').forEach(b=>b.classList.toggle('on',b.dataset.ia===ia));const has=!!links[ia];
 $('gem').textContent=has?`🤖 Continuar no meu chat do ${IA[ia].n}`:`🤖 Mandar pra IA (${IA[ia].n})`;$('gemOpts').classList.toggle('hidden',!has)}
document.querySelectorAll('#iaSeg button').forEach(b=>b.onclick=()=>{ia=b.dataset.ia;LS.set('bt_ia',ia);gemUI()});
let pendingAsk=null,askFor=ia;
async function openIA(url,ask){await copy(text());toast('Texto copiado — cole no chat e envie');pendingAsk=ask?ia:null;window.open(url,'_blank')}
$('gem').onclick=()=>links[ia]?openIA(links[ia],false):openIA(IA[ia].neu(text()),true);
$('gemNew').onclick=()=>openIA(IA[ia].neu(text()),false);
function showAsk(k){askFor=k;$('askT').textContent=`Quer usar sempre essa conversa do ${IA[k].n}?`;
 $('askHelp').textContent=`Abra a conversa no navegador com sua conta e copie o endereço da barra (ex.: ${IA[k].ex}). Não use o link de “Compartilhar”, que é público e não continua a conversa.`;
 $('askUrl').value='';$('ask').classList.remove('hidden');$('ask').scrollIntoView()}
$('gemSwap').onclick=()=>showAsk(ia);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&pendingAsk){const k=pendingAsk;pendingAsk=null;showAsk(k)}});
$('askOk').onclick=()=>{const u=$('askUrl').value,e=check(u,askFor);if(e)return toast(e);links[askFor]=u.trim();LS.set('bt_links',links);$('u_'+askFor).value=u.trim();$('ask').classList.add('hidden');gemUI();toast('Chat salvo')};
$('askNo').onclick=()=>$('ask').classList.add('hidden');
for(const k in IA)$('u_'+k).value=links[k]||'';$('pref').value=LS.get('bt_pref','');
$('saveCfg').onclick=()=>{for(const k in IA){const u=$('u_'+k).value.trim();if(u){const e=check(u,k);if(e)return toast(e)}}
 for(const k in IA){const u=$('u_'+k).value.trim();if(u)links[k]=u;else delete links[k]}LS.set('bt_links',links);LS.set('bt_pref',$('pref').value);gemUI();toast('Configurações salvas')};
gemUI();
// exportar
function dl(name,body){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([body],{type:'text/plain;charset=utf-8'}));a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),2000)}
const stamp=t=>new Date(t).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});const fstamp=()=>new Date().toISOString().slice(0,16).replace(/[:T]/g,'-');
$('dlMd').onclick=()=>dl(`transcricao-${fstamp()}.md`,`# Transcrição · ${curName}\n\n${$('txt').value.trim()}\n`);
$('dlTxt').onclick=()=>dl(`transcricao-${fstamp()}.txt`,$('txt').value.trim()+'\n');
const H=()=>LS.get('bt_hist',[]);
$('hMd').onclick=()=>{const h=H();if(!h.length)return toast('Histórico vazio');dl(`historico-transcreve-${fstamp()}.md`,'# Histórico · BND Transcreve\n\n'+h.map(x=>`## ${stamp(x.at)} · ${x.n||'áudio'}${x.s?' · '+x.s:''} (${x.d}s)\n\n${x.t}\n`).join('\n'))};
$('hTxt').onclick=()=>{const h=H();if(!h.length)return toast('Histórico vazio');dl(`historico-transcreve-${fstamp()}.txt`,h.map(x=>`[${stamp(x.at)}] ${x.n||'áudio'}${x.s?' · '+x.s:''} (${x.d}s)\n${x.t}\n`).join('\n'))};
// arrastar e soltar
let dc=0;addEventListener('dragenter',e=>{e.preventDefault();dc++;document.body.classList.add('drag')});
addEventListener('dragleave',()=>{if(--dc<=0){dc=0;document.body.classList.remove('drag')}});
addEventListener('dragover',e=>e.preventDefault());
addEventListener('drop',e=>{e.preventDefault();dc=0;document.body.classList.remove('drag');const f=[...(e.dataTransfer.files||[])].filter(f=>/^(audio|video)\//.test(f.type)||/\.(opus|ogg|oga|m4a|mp3|wav|aac|mp4)$/i.test(f.name));f.length?enqueue(f):toast('Solte um arquivo de áudio')});
// histórico
function addHist(t,d,it){const h=LS.get('bt_hist',[]);h.unshift({t,d:Math.round(d),at:Date.now(),n:curName,qid:it&&it.id,s:it&&it.sender||'',da:it&&it.dateAudio||''});LS.set('bt_hist',h.slice(0,30));renderHist()}
function renderHist(){const h=LS.get('bt_hist',[]),el=$('hist');if(!h.length){el.textContent='Nenhuma transcrição ainda.';return}el.innerHTML='';
 h.forEach((x,i)=>{const d=document.createElement('div');d.className='hi';const p=document.createElement('p');p.textContent=new Date(x.at).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})+' · '+x.t;
  p.onclick=()=>{curName=x.n||'histórico';lastBlob=null;show(x.t)};const b=document.createElement('button');b.textContent='Apagar';b.onclick=()=>{const h2=LS.get('bt_hist',[]);h2.splice(i,1);LS.set('bt_hist',h2);renderHist()};d.append(p,b);el.append(d)})}
$('clr').onclick=()=>{if(confirm('Apagar todo o histórico?')){LS.set('bt_hist',[]);renderHist()}};renderHist();

$('nEach').checked=LS.get('bt_notif_each',false);$('nEach').onchange=()=>LS.set('bt_notif_each',$('nEach').checked);
