// Read-only export of one offer's public ad evidence; credentials and monitoring configuration never leave the server.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
const companyId='69706e9a-95ad-493e-b4ab-4a6de7541adc';
const script=`const fs=require('fs'),crypto=require('crypto');
const company='${companyId}',owner='company:'+company,hash=crypto.createHash('sha256').update(owner).digest('hex');
const state=JSON.parse(fs.readFileSync('/data/spy/'+hash+'.json'));
const job=Object.values(state.jobs).find(j=>j.id==='995e6bfd-8c26-47fb-9614-0a02a7dd97b0');if(!job)throw Error('missing');
const extra=JSON.parse(fs.readFileSync('/data/spy/creative-recovery/'+hash+'/'+job.id+'/enriched.json'));
const snapshots=job.snapshots.map(s=>({at:s.at,scope:s.scope,baseline:s.baseline,added:s.added,ads:s.ads.map(a=>({...a,...(!a.creativeComplete?extra[a.id]:{})}))}));
for(const s of snapshots)for(const a of s.ads)if(!a.thumbnailDigest&&/^[a-f0-9]{64}$/.test(a.thumbnailKey||'')){try{a.thumbnailDigest=crypto.createHash('sha256').update(fs.readFileSync('/data/spy/media/'+hash+'/'+a.thumbnailKey)).digest('hex')}catch{}}
console.log('VISUAL_SOURCE:'+JSON.stringify({companyId:company,job:{id:job.id,name:job.name,snapshots}}));`;
const output=execFileSync('/opt/homebrew/bin/railway',['ssh','--project','3704cd93-6011-4e5f-be52-f229b499b018','--environment','production','--service','@page-cloner/web','--','node','-e',script],{encoding:'utf8',timeout:90000,maxBuffer:20000000});
const line=output.split('\n').find(l=>l.startsWith('VISUAL_SOURCE:'));if(!line)throw Error('Export missing');
const data=JSON.parse(line.slice(14));const dir=join(homedir(),'.codex/local-data/tmx/ai-preview/spy-visual-source',companyId);mkdirSync(dir,{recursive:true,mode:0o700});writeFileSync(join(dir,'source.json'),JSON.stringify(data),{mode:0o600});console.log(JSON.stringify({offer:data.job.name,readings:data.job.snapshots.length,latest:data.job.snapshots.at(-1).at,ads:data.job.snapshots.at(-1).ads.length}));
