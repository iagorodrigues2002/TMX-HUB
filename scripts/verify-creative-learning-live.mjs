import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

async function verifyRemote(mode) {
  const {createHmac,randomUUID}=require('node:crypto');
  const sql=require('postgres')(process.env.DATABASE_URL,{max:1});
  const redis=new (require('ioredis'))(process.env.REDIS_URL);
  const company='69706e9a-95ad-493e-b4ab-4a6de7541adc',userId='01KQSEXEWXZ9Y67V2HFK18JHJB';
  try {
    const [email,role]=await redis.hmget('user:'+userId,'email','role');
    if(!email||role!=='admin')throw Error('Authorized release actor unavailable');
    const [member]=await sql`SELECT role FROM company_memberships WHERE company_id=${company} AND user_id=${userId} AND status='active'`;
    if(member?.role!=='owner')throw Error('Company owner mismatch');
    const enc=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
    const time=Math.floor(Date.now()/1000),prefix=enc({alg:'HS256',typ:'JWT'})+'.'+enc({sub:userId,email,role,iat:time,exp:time+600});
    const token=prefix+'.'+createHmac('sha256',process.env.JWT_SECRET).update(prefix).digest('base64url');
    const headers={authorization:'Bearer '+token,'content-type':'application/json',origin:'https://theminex.com'};
    const base='http://127.0.0.1:'+(process.env.PORT||process.env.API_PORT||4000)+'/v1/meta-control/traffic/ai';
    async function call(path,body,method=body?'POST':'GET'){
      const response=await fetch(base+path,{method,headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(180000)});
      const result=await response.json();
      if(!response.ok)throw Error('HTTP '+response.status+' '+(result.detail??path));
      return result;
    }
    const memory=await call('/creative-learning?companyId='+company);
    const records=memory.records.filter(r=>r.version==='creative-structure-v1');
    const unique=new Set(records.map(r=>r.offerId+':'+r.creativeKey));
    if(unique.size<256)throw Error('Saved creative coverage incomplete');
    if(mode==='enable') {
      const result=await call('/creative-analysis/automation',{companyId:company,enabled:true},'PUT');
      console.log(JSON.stringify({automation:result,company,actor:userId}));return;
    }
    const selected=records.filter(r=>/AD5:L17$/.test(r.creativeKey)&&r.creativeKey.startsWith('PJR_ENG:')).slice(0,1);
    if(!selected.length)throw Error('AD05_L17 absent');
    for(const record of selected){
      const offer=memory.offers.find(o=>o.id===record.offerId);
      const input={companyId:company,key:record.creativeKey,fileId:record.ads[0],offer:offer.name};
      const get=await call('/creative-analysis?'+new URLSearchParams(input));
      const post=await call('/creative-analysis',input);
      if(!get.analysis?.cached||!post.analysis?.cached||!get.frames?.length||!get.transcription?.analysis)throw Error('Saved media not reused');
    }
    const before=await sql`SELECT fingerprint FROM company_spy_visual_analyses WHERE company_id=${company} AND record->>'version'='creative-structure-v1'`;
    let chat=null;
    if(mode==='chat'){
      chat=await call('/chat',{companyId:company,requestId:randomUUID(),question:'Analise o criativo PJR_ENG_AD05_L17 usando a análise visual e o áudio já salvos. Descreva o vídeo, a frase, o CTA e a música observados. Cruze com as métricas completas do funil, incluindo upsells e ROAS TMX. Sugira uma única variação próxima, sem transformar em outro anúncio e sem solicitar nova análise.',scope:{from:'2026-08-01',to:'2026-11-14',offer:'PJR_ENG',query:'',level:'ads'}});
    }
    const after=await sql`SELECT fingerprint FROM company_spy_visual_analyses WHERE company_id=${company} AND record->>'version'='creative-structure-v1'`;
    if(JSON.stringify(before.map(r=>r.fingerprint).sort())!==JSON.stringify(after.map(r=>r.fingerprint).sort()))throw Error('Unexpected new visual analysis');
    console.log(JSON.stringify({company,uniqueCreatives:unique.size,visualRecords:records.length,cachedGetAndPost:true,newVisualAnalyses:0,chat}));
  }finally{await redis.quit();await sql.end();}
}
const mode=process.argv[2]??'verify';
if(!['verify','chat','enable'].includes(mode))throw Error('Invalid release verification mode');
const source=`(${verifyRemote.toString()})(${JSON.stringify(mode)}).catch(e=>{console.error('LIVE_CREATIVE_VERIFY_FAILED',e.message);process.exitCode=1})`;
const output=execFileSync('railway',['ssh','--project','3704cd93-6011-4e5f-be52-f229b499b018','--environment','production','--service','@page-cloner/api','--','node','-e',source],{encoding:'utf8',maxBuffer:2000000,timeout:240000});
await writeFile(join(homedir(),'.codex/local-data/tmx/ai-preview/creative-learning/69706e9a-95ad-493e-b4ab-4a6de7541adc',`live-${mode}-receipt.json`),JSON.stringify({at:new Date().toISOString(),output}),{mode:0o600});
console.log(mode==='chat'?'Live assistant response saved to private release receipt.':output);
