import {pipeline,env} from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';
env.allowLocalModels=false;
let pipe=null,cur='';
async function load(model){
 if(pipe&&cur===model)return pipe;
 const gpu=!!(self.navigator&&navigator.gpu&&await navigator.gpu.requestAdapter().catch(()=>null));
 const device=gpu?'webgpu':'wasm';
 const dtype=gpu?{encoder_model:'fp32',decoder_model_merged:'q4'}:'q8';
 const files={};
 pipe=await pipeline('automatic-speech-recognition',model,{device,dtype,progress_callback:p=>{
  if(p.status==='progress'&&p.total){files[p.file]=[p.loaded,p.total];let l=0,t=0;for(const k in files){l+=files[k][0];t+=files[k][1]}postMessage({t:'dl',l,tot:t})}}});
 cur=model;postMessage({t:'ready',device});return pipe}
onmessage=async e=>{const {audio,model}=e.data;try{
 const p=await load(model);const dur=audio.length/16000;const t0=performance.now();
 postMessage({t:'start',dur});
 let done=0;const tick=setInterval(()=>{postMessage({t:'tick',el:(performance.now()-t0)/1000,dur})},500);
 const out=await p(audio,{language:'portuguese',task:'transcribe',chunk_length_s:30,stride_length_s:5,return_timestamps:false});
 clearInterval(tick);postMessage({t:'done',text:(out.text||'').trim(),secs:(performance.now()-t0)/1000,dur});
}catch(err){postMessage({t:'err',msg:String(err&&err.message||err)})}};
