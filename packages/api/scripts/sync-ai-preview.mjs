// Local-only, read-only export. No Meta requests or production writes.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
const directory = join(homedir(), '.codex/local-data/tmx/ai-preview');
const remote = String.raw`
let readStage='startup';
(async()=>{
 const Redis=require('ioredis'), postgres=require('postgres'), crypto=require('node:crypto');
 const redis=new Redis(process.env.REDIS_URL);const sql=postgres(process.env.DATABASE_URL,{max:1});
 try {
 const company=await redis.get('creative-drive:v1:company-id');if(!company)throw Error('company_missing');
 const owner='01KQSEXEWXZ9Y67V2HFK18JHJB';
 const membership=await sql.unsafe('SELECT company_id FROM company_memberships WHERE company_id::text=$1 AND user_id=$2 AND status=\'active\'',[company,owner]);if(!membership.length)throw Error('membership_missing');
 const offers=await sql.unsafe('SELECT offer_id AS id FROM company_offers WHERE company_id::text=$1',[company]);
 const ids=offers.map(o=>o.id);
 const user=await redis.hgetall('user:'+owner);if(user.id!==owner)throw Error('user_missing');
 const now=Math.floor(Date.now()/1000);const payload=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:owner,email:user.email,role:user.role,iat:now,exp:now+120})).toString('base64url');
 const token=payload+'.'+crypto.createHmac('sha256',process.env.JWT_SECRET).update(payload).digest('base64url');
 const to=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
 readStage='traffic';const response=await fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/v1/meta-control/traffic/connection/report?from=2026-08-01&to='+to+'&hourly=0',{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(45000)});if(!response.ok&&response.status!==409){readStage='traffic'+response.status;throw Error('traffic_unavailable');}
 const report=response.ok?await response.json():null;
 const snapshot=report?{}:null;if(report)for(const key of ['fetchedAt','from','to','attribution','purchaseClassification','accounts','campaigns','insights','ads','fx','failures'])if(report[key]!==undefined)snapshot[key]=report[key];
 readStage='offers';const overview=await fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/v1/offers',{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});
 const offerBody=overview.ok?await overview.json():[];const list=Array.isArray(offerBody)?offerBody:offerBody.offers??offerBody.items??[];
 const names=offers.map(o=>({id:o.id,name:list.find(x=>x.id===o.id)?.name??o.id}));
 const sales=await sql.unsafe("SELECT p.offer_id, (o.paid_at AT TIME ZONE 'America/Sao_Paulo')::date::text AS date, o.currency, o.order_kind, count(*)::int AS count, sum(o.amount_minor)::text AS gross_minor FROM tracking_orders o JOIN tracking_projects p ON p.id=o.project_id WHERE p.offer_id=ANY($1::text[]) AND o.paid_at>='2026-08-01T03:00:00Z' AND o.status='paid' GROUP BY 1,2,3,4",[ids]);
 const reversals=await sql.unsafe("SELECT p.offer_id, (COALESCE(o.chargeback_at,o.refunded_at) AT TIME ZONE 'America/Sao_Paulo')::date::text AS date, o.currency, CASE WHEN o.chargeback_at IS NOT NULL OR o.status='chargeback' THEN 'chargeback' ELSE 'refund' END AS kind, count(*)::int AS count, sum(o.amount_minor)::text AS amount_minor FROM tracking_orders o JOIN tracking_projects p ON p.id=o.project_id WHERE p.offer_id=ANY($1::text[]) AND (o.refunded_at IS NOT NULL OR o.chargeback_at IS NOT NULL OR o.status IN ('refunded','chargeback')) GROUP BY 1,2,3,4",[ids]);
 const jobs=await redis.zrange('bull:traffic-management-v1:completed',0,-1);const optimizations=[];
 for(const id of jobs){const raw=await redis.hmget('bull:traffic-management-v1:'+id,'data','returnvalue','finishedOn');if(!raw[0]||!raw[1])continue;const data=JSON.parse(raw[0]),after=JSON.parse(raw[1]);if(data.scope!=='company:'+company)continue;
 optimizations.push({id,at:new Date(Number(raw[2])).toISOString(),actorId:data.actor,level:data.level,itemId:data.item.id,name:data.item.name,accountId:data.item.accountId,currency:data.item.currency,budgetField:data.item.budgetField,before:{status:data.item.status,budget:data.item.budget},after:{status:after.status,budget:after.budget}});}
 const config=await redis.get('traffic-company:v1:'+company+':settings:classification');
 console.log('TMX_AI_EXPORT:'+JSON.stringify({companyId:company,fetchedAt:new Date().toISOString(),offers:names,snapshot,sales,reversals,optimizations,classification:config?JSON.parse(config).value:{campaigns:{},links:{}}}));
 } finally {await sql.end();redis.disconnect();}
})().catch(()=>{console.error('AI_PREVIEW_READ_FAILED:'+readStage);process.exitCode=1});`;
await mkdir(directory, { recursive: true, mode: 0o700 });
const { stdout } = await promisify(execFile)('railway', ['ssh', '--project', '3704cd93-6011-4e5f-be52-f229b499b018', '--environment', 'production', '--service', '@page-cloner/api', '--', 'node', '-e', remote], { timeout: 150000, maxBuffer: 60_000_000 }).catch(error=>{const stage=/AI_PREVIEW_READ_FAILED:([a-z0-9]+)/.exec(error.stderr??'')?.[1];throw Error('AI_PREVIEW_READ_FAILED'+(stage?':'+stage:''));});
const line = stdout.split('\n').find(line=>line.startsWith('TMX_AI_EXPORT:'));
if (!line) throw Error('Exportação não disponível');
const data=JSON.parse(line.slice('TMX_AI_EXPORT:'.length));
if(!data.companyId)throw Error('Exportação inválida');
// Pin the authorized tenant independently of the replaceable data snapshot.
const companyFile=join(directory,'company.json');
try{await writeFile(companyFile,JSON.stringify({companyId:data.companyId}),{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;}
if(JSON.parse(await readFile(companyFile,'utf8')).companyId!==data.companyId)throw Error('Empresa diferente da provisionada nesta prévia');
let previous;try{previous=JSON.parse(await readFile(join(directory,'data.json'),'utf8'));}catch{}
data.trafficStale=!data.snapshot;
if(!data.snapshot&&previous?.companyId===data.companyId)data.snapshot=previous.snapshot;
if(!Array.isArray(data.snapshot?.insights))throw Error('Primeira consulta de mídia ainda indisponível');
const history=new Map((previous?.companyId===data.companyId?previous.optimizations:[]).map(item=>[item.id,item]));
for(const item of data.optimizations)history.set(item.id,item);
data.optimizations=[...history.values()].sort((a,b)=>a.at.localeCompare(b.at));
const temporary=join(directory,'data-'+process.pid+'.json');
await writeFile(temporary,JSON.stringify(data),{mode:0o600});await rename(temporary,join(directory,'data.json'));
console.log(JSON.stringify({updated:true,trafficStale:data.trafficStale,offers:data.offers.length,optimizations:data.optimizations.length,ads:data.snapshot.insights.length}));
