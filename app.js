const $=id=>document.getElementById(id);
const LS={get:(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}},set:(k,v)=>localStorage.setItem(k,JSON.stringify(v))};
if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js');
function toast(m){const t=$('toast');t.textContent=m;t.classList.add('on');clearTimeout(toast.h);toast.h=setTimeout(()=>t.classList.remove('on'),3000)}
$('model').value=LS.get('bt_model','onnx-community/whisper-base');$('model').onchange=()=>LS.set('bt_model',$('model').value);
const worker=new Worker('worker.js',{type:'module'});let busy=false,curName='';
function prog(txt,p){$('prog').classList.remove('hidden');$('st').textContent=txt;if(p!=null)$('pb').style.width=Math.min(100,p)+'%'}
worker.onmessage=e=>{const m=e.data;
 if(m.t==='dl')prog(`Baixando modelo (só na 1ª vez): ${(m.l/1e6).toFixed(0)} de ${(m.tot/1e6).toFixed(0)} MB`,m.l/m.tot*100);
 else if(m.t==='ready')window.__device=m.device;
 else if(m.t==='start')prog('Transcrevendo…',2);
 else if(m.t==='tick'){const est=m.dur*(window.__device==='webgpu'?0.15:0.6)+3;prog(`Transcrevendo… ${m.el.toFixed(0)} s`,Math.min(95,m.el/est*100))}
 else if(m.t==='done'){busy=false;prog(`Pronto em ${m.secs.toFixed(1)} s (áudio de ${m.dur.toFixed(0)} s, ${window.__device==='webgpu'?'GPU':'CPU'})`,100);window.__last=m;
  show(m.text);addHist(m.text,m.dur)}
 else if(m.t==='err'){busy=false;prog('Erro: '+m.msg,0);toast('Não consegui transcrever')}};
async function decode(blob){const buf=await blob.arrayBuffer();const ac=new (window.AudioContext||window.webkitAudioContext)();
 const ab=await ac.decodeAudioData(buf);ac.close();
 const len=Math.ceil(ab.duration*16000);const off=new OfflineAudioContext(1,len,16000);const src=off.createBufferSource();src.buffer=ab;src.connect(off.destination);src.start();
 const r=await off.startRendering();return r.getChannelData(0)}
async function run(blob,name){if(busy)return toast('Aguarde a transcrição atual');busy=true;curName=name||'áudio';$('res').classList.add('hidden');
 try{prog('Lendo áudio…',0);const audio=await decode(blob);prog('Preparando modelo…',0);worker.postMessage({audio,model:$('model').value},[audio.buffer])}
 catch(err){busy=false;prog('Não consegui ler esse arquivo de áudio ('+err.message+')',0)}}
window.__run=run;
$('pick').onclick=()=>$('file').click();$('file').onchange=e=>{const f=e.target.files[0];if(f)run(f,f.name);e.target.value=''};
(async()=>{if(!location.search.includes('shared'))return;history.replaceState(null,'',location.pathname);
 const c=await caches.open('bt-share');const r=await c.match('./shared-audio');if(!r)return toast('Não recebi o áudio compartilhado');
 const b=await r.blob();const n=decodeURIComponent(r.headers.get('X-Name')||'áudio');await c.delete('./shared-audio');run(b,n)})();
function show(t){$('res').classList.remove('hidden');$('txt').value=t;$('rt').textContent='Transcrição · '+curName;gemUI();$('res').scrollIntoView({behavior:'smooth'})}
function text(){const p=LS.get('bt_pref','').trim();const t=$('txt').value.trim();return p?p+'\n'+t:t}
async function copy(t){try{await navigator.clipboard.writeText(t);return true}catch{const a=document.createElement('textarea');a.value=t;document.body.appendChild(a);a.select();const ok=document.execCommand('copy');a.remove();return ok}}
$('copy').onclick=async()=>toast(await copy($('txt').value)?'Texto copiado':'Não consegui copiar');
$('share').onclick=async()=>{if(navigator.share){try{await navigator.share({text:$('txt').value})}catch{}}else{await copy($('txt').value);toast('Compartilhar indisponível, texto copiado')}};
// Gemini
const okUrl=u=>{try{const x=new URL(u.trim());return x.protocol==='https:'&&(x.hostname==='gemini.google.com'||x.hostname==='g.co')}catch{return false}};
function gemUI(){$('gemOpts').classList.toggle('hidden',!LS.get('bt_gem',''))}
let pendingAsk=false;
async function openGem(url,ask){await copy(text());toast('Texto copiado — cole no chat e envie');pendingAsk=ask;window.open(url,'_blank')}
$('gem').onclick=()=>{const g=LS.get('bt_gem','');g?openGem(g,false):openGem('https://gemini.google.com/app',true)};
$('gemNew').onclick=()=>openGem('https://gemini.google.com/app',false);
$('gemSwap').onclick=()=>{$('ask').classList.remove('hidden');$('askUrl').value='';$('askUrl').focus()};
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&pendingAsk){pendingAsk=false;$('ask').classList.remove('hidden');$('ask').scrollIntoView()}});
$('askOk').onclick=()=>{const u=$('askUrl').value;if(!okUrl(u))return toast('Link inválido: use um link do gemini.google.com ou g.co');LS.set('bt_gem',u.trim());$('gUrl').value=u.trim();$('ask').classList.add('hidden');gemUI();toast('Chat salvo')};
$('askNo').onclick=()=>$('ask').classList.add('hidden');
$('gUrl').value=LS.get('bt_gem','');$('pref').value=LS.get('bt_pref','');
$('saveCfg').onclick=()=>{const u=$('gUrl').value.trim();if(u&&!okUrl(u))return toast('Link inválido: use um link do gemini.google.com ou g.co');LS.set('bt_gem',u);LS.set('bt_pref',$('pref').value);gemUI();toast('Configurações salvas')};
// histórico
function addHist(t,d){const h=LS.get('bt_hist',[]);h.unshift({t,d:Math.round(d),at:Date.now(),n:curName});LS.set('bt_hist',h.slice(0,30));renderHist()}
function renderHist(){const h=LS.get('bt_hist',[]),el=$('hist');if(!h.length){el.textContent='Nenhuma transcrição ainda.';return}el.innerHTML='';
 h.forEach((x,i)=>{const d=document.createElement('div');d.className='hi';const p=document.createElement('p');p.textContent=new Date(x.at).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})+' · '+x.t;
  p.onclick=()=>{curName=x.n||'histórico';show(x.t)};const b=document.createElement('button');b.textContent='Apagar';b.onclick=()=>{const h2=LS.get('bt_hist',[]);h2.splice(i,1);LS.set('bt_hist',h2);renderHist()};d.append(p,b);el.append(d)})}
$('clr').onclick=()=>{if(confirm('Apagar todo o histórico?')){LS.set('bt_hist',[]);renderHist()}};renderHist();
