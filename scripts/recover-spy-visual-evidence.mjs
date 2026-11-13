import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
const company='69706e9a-95ad-493e-b4ab-4a6de7541adc',jobId='995e6bfd-8c26-47fb-9614-0a02a7dd97b0';
const dir=join(homedir(),'.codex/local-data/tmx/ai-preview/spy-visual-source',company);
const mode=process.argv[2];
if(!['thumbnails','missing'].includes(mode))throw Error('Choose thumbnails or missing');
const output=join(dir,mode+'-recovery.json');
if(existsSync(output)){console.log('Existing recovery reused: '+output);process.exit(0);}
const source=JSON.parse(readFileSync(join(dir,'source.json')));
const missing=[...new Set(source.job.snapshots.slice(0,-1).flatMap(s=>s.ads.filter(a=>!a.creativeAssets?.length).map(a=>a.id)))];
const common=`const fs=require('fs'),crypto=require('crypto');const hash=crypto.createHash('sha256').update('company:${company}').digest('hex');const state=JSON.parse(fs.readFileSync('/data/spy/'+hash+'.json'));if(state.owner!=='company:${company}')throw Error('Owner mismatch');`;
const script=mode==='thumbnails'? common+`
const keys=[...new Set(state.jobs['${jobId}'].snapshots.flatMap(s=>s.ads.map(a=>a.thumbnailKey)).filter(k=>/^[a-f0-9]{64}$/.test(k)))];const images={},aliases={};for(const k of keys){try{const b=fs.readFileSync('/data/spy/media/'+hash+'/'+k);if(b.length<1500000){const digest=crypto.createHash('sha256').update(b).digest('hex');aliases[k]=digest;if(!images[digest])images[digest]=b.toString('base64')}}catch{}}console.log('PUBLIC_EVIDENCE:'+JSON.stringify({images,aliases}));`
:common+`
(async()=>{const [iv,tag,encrypted]=state.encrypted.split('.');const cipher=crypto.createDecipheriv('aes-256-gcm',fs.readFileSync('/data/spy/.key'),Buffer.from(iv,'base64url'));cipher.setAuthTag(Buffer.from(tag,'base64url'));const token=Buffer.concat([cipher.update(Buffer.from(encrypted,'base64url')),cipher.final()]).toString();const items=[];
for(const id of ${JSON.stringify(missing)}){try{const u=new URL('https://api.scrapecreators.com/v1/facebook/adLibrary/ad');u.search=new URLSearchParams({id,get_transcript:'false',cache_max_age:'1d'});const r=await fetch(u,{headers:{'x-api-key':token},redirect:'error',signal:AbortSignal.timeout(45000)});const b=await r.json();if(b.adArchiveID&&String(b.adArchiveID)!==id)throw Error('Wrong ad');items.push({id,status:r.status,ok:r.ok&&b.success===true,creditsCharged:b.credits_charged??(r.ok&&b.success?1:0),snapshot:b.snapshot??null,at:new Date().toISOString()});if([401,402,403,429].includes(r.status))break;}catch{items.push({id,ok:false,error:'unavailable',at:new Date().toISOString()})}}
console.log('PUBLIC_EVIDENCE:'+JSON.stringify({items}));})().catch(()=>{process.exitCode=1});`;
let raw;try{raw=execFileSync('/opt/homebrew/bin/railway',['ssh','--project','3704cd93-6011-4e5f-be52-f229b499b018','--environment','production','--service','@page-cloner/web','--','node','-e',script],{encoding:'utf8',timeout:450000,maxBuffer:300000000});}catch(e){console.error('Evidence export failed:',e.code??e.status);process.exit(1);}
const line=raw.split('\n').find(l=>l.startsWith('PUBLIC_EVIDENCE:'));if(!line)throw Error('No public evidence returned');
const data=JSON.parse(line.slice('PUBLIC_EVIDENCE:'.length));writeFileSync(output,JSON.stringify(data),{mode:0o600});
console.log(JSON.stringify(mode==='thumbnails'?{images:Object.keys(data.images).length}:{items:data.items.map(i=>({id:i.id,status:i.status,ok:i.ok,credits:i.creditsCharged,hasSnapshot:!!i.snapshot})),credits:data.items.reduce((s,i)=>s+(i.creditsCharged||0),0)}));
