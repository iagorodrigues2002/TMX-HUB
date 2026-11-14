import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { requestCreativeAnalysis } from './creative-analysis-request.mjs';
// Local-only, explicit batch. Existing API enforces company access, cache and daily budget.
const base = 'http://localhost:3120';
if (!process.env.TMX_PREVIEW_EMAIL || !process.env.TMX_PREVIEW_PASSWORD) throw Error('Set local preview login environment variables.');
const login = await fetch(`${base}/v1/auth/login`, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:process.env.TMX_PREVIEW_EMAIL,password:process.env.TMX_PREVIEW_PASSWORD})});
const {token}=await login.json(); if(!token)throw Error('Preview login failed');
const headers={authorization:`Bearer ${token}`,origin:base,'content-type':'application/json'};
const response=await fetch(`${base}/v1/meta-control/traffic/ai/creative-learning/inventory`,{headers});
if(!response.ok)throw Error(`Inventory ${response.status}`);
const inventory=await response.json();
if(!/^[a-f0-9-]{36}$/.test(inventory.companyId))throw Error('Invalid company');
const dir=join(homedir(),'.codex/local-data/tmx/ai-preview/creative-learning',inventory.companyId);
await mkdir(dir,{recursive:true,mode:0o700});
const file=join(dir,'bulk-analysis.json');
let previous={items:[]};try{previous=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
// Retry unfinished routes after fixes; provider caches still block uncertain paid requests.
const items=inventory.items.map(item=>({...item,state:item.analyzed?'complete':'pending'}))
  .sort((a,b)=>(b.status==='Validado')-(a.status==='Validado')||(b.metrics?.spend??0)-(a.metrics?.spend??0));
const state={companyId:inventory.companyId,startedAt:previous.startedAt??new Date().toISOString(),status:'running',unresolvedFiles:inventory.unresolvedFiles,metricsWithoutFile:inventory.metricsWithoutFile,items};
let stopping=false;
process.once('SIGTERM',()=>{stopping=true;});
let saving=Promise.resolve();
function save(){saving=saving.then(async()=>{state.updatedAt=new Date().toISOString();await writeFile(`${file}.tmp`,JSON.stringify(state),{mode:0o600});await rename(`${file}.tmp`,file);});return saving;}
await save();
async function worker(){
for(const item of items){
  if(stopping||state.status!=='running')break;
  if(item.state!=='pending')continue;
  item.state='processing';await save();
  try{
    let r,result;
    for(const fileId of [item.fileId,...(item.alternativeFileIds??[])]){
      r=await requestCreativeAnalysis(`${base}/api/creative-analysis`,headers,{key:item.key,fileId,offer:item.offer});
      result=r.result;
      if(r.ok){item.analyzedFileId=fileId;break;}
      if(!/150 MB|1 GB/.test(String(result.detail)))break;
    }
    if(!r.ok){
      item.state='failed';item.error=String(result.detail??`HTTP ${r.status}`).slice(0,400);
      if(/limit|orçamento|budget|saldo/i.test(item.error)){state.status='budget_blocked';item.state='pending';await save();break;}
    }else{item.state='complete';delete item.error;item.analyzedAt=result.analysis?.at;}
  }catch(e){item.state='uncertain';item.error=String(e.message).slice(0,400);}
  await save();
  console.log(JSON.stringify({complete:items.filter(i=>i.state==='complete').length,total:items.length,failed:items.filter(i=>['failed','uncertain'].includes(i.state)).length}));
}
}
// Bound concurrent downloads and provider requests; persisted provider caches prevent duplicate billing.
await Promise.all(Array.from({length:3},()=>worker()));
const refreshed=await fetch(`${base}/v1/meta-control/traffic/ai/creative-learning/inventory`,{headers});
if(refreshed.ok){const latest=await refreshed.json();for(const item of items){const saved=latest.items.find(r=>r.key===item.key&&r.analyzed);if(saved){item.state='complete';item.analyzedFileId=saved.analyzedFileId;item.analyzedAt=saved.analyzedAt;}}}
if(state.status==='running')state.status=items.every(i=>i.state==='complete')?'complete':stopping?'paused':'needs_review';
await save();console.log(JSON.stringify({status:state.status,file}));
