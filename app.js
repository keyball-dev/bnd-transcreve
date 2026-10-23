const $=id=>document.getElementById(id);
const LS={get:(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}},set:(k,v)=>localStorage.setItem(k,JSON.stringify(v))};
if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js');
function toast(m){const t=$('toast');t.textContent=m;t.classList.add('on');clearTimeout(toast.h);toast.h=setTimeout(()=>t.classList.remove('on'),3000)}
const DEFM=LS.get('bt_default',LS.get('bt_model','onnx-community/whisper-base'));$('model').value=DEFM;$('defModel').value=DEFM;
$('defModel').onchange=()=>{LS.set('bt_default',$('defModel').value);$('model').value=$('defModel').value;toast('Modo padrão salvo')};let lastBlob=null;
const worker=new Worker('worker.js',{type:'module'});let busy=false,curName='';
function prog(txt,p){$('prog').classList.remove('hidden');$('st').textContent=txt;if(p!=null)$('pb').style.width=Math.min(100,p)+'%'}
worker.onmessage=e=>{const m=e.data;
 if(m.t==='dl')prog(`Baixando modelo (só na 1ª vez): ${(m.l/1e6).toFixed(0)} de ${(m.tot/1e6).toFixed(0)} MB`,m.l/m.tot*100);
 else if(m.t==='ready')window.__device=m.device;
 else if(m.t==='start')prog('Transcrevendo…',2);
 else if(m.t==='tick'){const est=m.dur*(window.__device==='webgpu'?0.15:0.6)+3;prog(`Transcrevendo… ${m.el.toFixed(0)} s`,Math.min(95,m.el/est*100))}
 else if(m.t==='done'){busy=false;prog(`Pronto em ${m.secs.toFixed(1)} s (áudio de ${m.dur.toFixed(0)} s, ${window.__device==='webgpu'?'GPU':'CPU'})`,100);window.__last=m;
  show(m.text,m.dur);addHist(m.text,m.dur)}
 else if(m.t==='err'){busy=false;prog('Erro: '+m.msg,0);toast('Não consegui transcrever')}};
async function decode(blob){const buf=await blob.arrayBuffer();const ac=new (window.AudioContext||window.webkitAudioContext)();
 const ab=await ac.decodeAudioData(buf);ac.close();
 const len=Math.ceil(ab.duration*16000);const off=new OfflineAudioContext(1,len,16000);const src=off.createBufferSource();src.buffer=ab;src.connect(off.destination);src.start();
 const r=await off.startRendering();return r.getChannelData(0)}
async function run(blob,name){if(busy)return toast('Aguarde a transcrição atual');busy=true;curName=name||'áudio';lastBlob=blob;$('res').classList.add('hidden');
 try{prog('Lendo áudio…',0);const audio=await decode(blob);prog('Preparando modelo…',0);worker.postMessage({audio,model:$('model').value},[audio.buffer])}
 catch(err){busy=false;prog('Não consegui ler esse arquivo de áudio ('+err.message+')',0)}}
window.__run=run;
$('pick').onclick=()=>$('file').click();$('file').onchange=e=>{const f=e.target.files[0];if(f)run(f,f.name);e.target.value=''};
(async()=>{if(!location.search.includes('shared'))return;history.replaceState(null,'',location.pathname);
 const c=await caches.open('bt-share');const r=await c.match('./shared-audio');if(!r)return toast('Não recebi o áudio compartilhado');
 const b=await r.blob();const n=decodeURIComponent(r.headers.get('X-Name')||'áudio');await c.delete('./shared-audio');run(b,n)})();
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
$('hMd').onclick=()=>{const h=H();if(!h.length)return toast('Histórico vazio');dl(`historico-transcreve-${fstamp()}.md`,'# Histórico · BND Transcreve\n\n'+h.map(x=>`## ${stamp(x.at)} · ${x.n||'áudio'} (${x.d}s)\n\n${x.t}\n`).join('\n'))};
$('hTxt').onclick=()=>{const h=H();if(!h.length)return toast('Histórico vazio');dl(`historico-transcreve-${fstamp()}.txt`,h.map(x=>`[${stamp(x.at)}] ${x.n||'áudio'} (${x.d}s)\n${x.t}\n`).join('\n'))};
// arrastar e soltar
let dc=0;addEventListener('dragenter',e=>{e.preventDefault();dc++;document.body.classList.add('drag')});
addEventListener('dragleave',()=>{if(--dc<=0){dc=0;document.body.classList.remove('drag')}});
addEventListener('dragover',e=>e.preventDefault());
addEventListener('drop',e=>{e.preventDefault();dc=0;document.body.classList.remove('drag');const f=[...(e.dataTransfer.files||[])].find(f=>/^(audio|video)\//.test(f.type)||/\.(opus|ogg|oga|m4a|mp3|wav|aac|mp4)$/i.test(f.name));f?run(f,f.name):toast('Solte um arquivo de áudio')});
// histórico
function addHist(t,d){const h=LS.get('bt_hist',[]);h.unshift({t,d:Math.round(d),at:Date.now(),n:curName});LS.set('bt_hist',h.slice(0,30));renderHist()}
function renderHist(){const h=LS.get('bt_hist',[]),el=$('hist');if(!h.length){el.textContent='Nenhuma transcrição ainda.';return}el.innerHTML='';
 h.forEach((x,i)=>{const d=document.createElement('div');d.className='hi';const p=document.createElement('p');p.textContent=new Date(x.at).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})+' · '+x.t;
  p.onclick=()=>{curName=x.n||'histórico';lastBlob=null;show(x.t)};const b=document.createElement('button');b.textContent='Apagar';b.onclick=()=>{const h2=LS.get('bt_hist',[]);h2.splice(i,1);LS.set('bt_hist',h2);renderHist()};d.append(p,b);el.append(d)})}
$('clr').onclick=()=>{if(confirm('Apagar todo o histórico?')){LS.set('bt_hist',[]);renderHist()}};renderHist();
