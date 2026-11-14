import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

// Release-only data transfer. No provider API calls and no credentials in the payload.
const company='69706e9a-95ad-493e-b4ab-4a6de7541adc';
const root=join(homedir(),'.codex/local-data/tmx/ai-preview');
const load=async(...parts)=>JSON.parse(await readFile(join(root,...parts),'utf8'));
const batch=await load('creative-learning',company,'bulk-analysis.json');
assert.equal(batch.companyId,company);assert.equal(batch.items.length,256);
assert(batch.items.every(i=>i.state==='complete'));
const records=[];
for(const name of await readdir(join(root,'spy-visual',company))){
  if(!/^[a-f0-9]{64}\.json$/.test(name))continue;
  const r=await load('spy-visual',company,name);
  if(r.version!=='creative-structure-v1'||r.status!=='complete')continue;
  if(!batch.items.some(i=>i.key===r.creativeKey&&i.offerId===r.offerId))continue;
  assert.equal(r.companyId,company);assert.equal(name,r.key+'.json');
  records.push(r);
}
assert.equal(new Set(records.map(r=>r.offerId+':'+r.creativeKey)).size,256);
const transcriptions=new Map(),documents=new Map();
for(const r of records){
  assert.match(r.assetKey,/^[a-f0-9]{64}$/);
  const media=await load('creative-media',company,r.assetKey+'.json');
  assert(media.frames.length>0&&media.frames.length<=6);
  assert(media.frames.every(f=>Number.isFinite(f.second)&&/^data:image\/jpeg;base64,/.test(f.image)));
  documents.set(`creative-media/${r.assetKey}.json`,{hash:media.hash,frames:media.frames,duration:media.duration});
  assert.match(r.audio.fingerprint,/^[a-f0-9]{64}$/);
  const audio=await load('spy-transcription',company,r.audio.fingerprint+'.json');
  assert.equal(audio.companyId,company);assert.equal(audio.status,'complete');
  assert.equal(audio.fingerprint,r.audio.fingerprint);
  transcriptions.set(audio.fingerprint,audio);
}
for(const name of ['bulk-analysis.json','niches.json','notes.json','observations.json']){
  try { documents.set(`creative-learning/${name}`,await load('creative-learning',company,name)); }
  catch(error) { if(error.code!=='ENOENT'||name==='bulk-analysis.json')throw error; }
}
const payload={company,records,transcriptions:[...transcriptions.values()],documents:[...documents].map(([name,document])=>({name,document}))};
const encoded=gzipSync(JSON.stringify(payload));
const summary={company,creatives:256,records:records.length,audio:transcriptions.size,media:[...documents.keys()].filter(k=>k.startsWith('creative-media/')).length,compressedBytes:encoded.length,payloadSha256:createHash('sha256').update(encoded).digest('hex')};
console.log(JSON.stringify({...summary,dryRun:!process.argv.includes('--execute')}));
if(!process.argv.includes('--execute'))process.exit(0);
async function importRemote() {
const {gunzipSync}=require('node:zlib'),{isDeepStrictEqual:eq}=require('node:util');
const chunks=[];for await(const chunk of process.stdin)chunks.push(chunk);
const p=JSON.parse(gunzipSync(Buffer.from(Buffer.concat(chunks).toString(),'base64')));
if(p.company!=='69706e9a-95ad-493e-b4ab-4a6de7541adc'||new Set(p.records.map(r=>r.offerId+':'+r.creativeKey)).size!==256)throw Error('Invalid scope');
const sql=require('postgres')(process.env.DATABASE_URL,{max:1});
try{await sql.begin(async tx=>{
const offers=new Set((await tx`SELECT offer_id FROM company_offers WHERE company_id=${p.company}`).map(r=>r.offer_id));
for(const r of p.records){
if(r.companyId!==p.company||!offers.has(r.offerId)||r.status!=='complete'||r.version!=='creative-structure-v1'||!/^[a-f0-9]{64}$/.test(r.key))throw Error('Invalid visual record');
await tx`INSERT INTO company_spy_visual_analyses(company_id,fingerprint,offer_id,record) VALUES(${p.company},${r.key},${r.offerId},${tx.json(r)}) ON CONFLICT DO NOTHING`;
const [saved]=await tx`SELECT record FROM company_spy_visual_analyses WHERE company_id=${p.company} AND fingerprint=${r.key}`;
if(!eq(saved.record,r))throw Error('Visual conflict');
}
for(const r of p.transcriptions){
if(r.companyId!==p.company||r.status!=='complete'||!/^[a-f0-9]{64}$/.test(r.fingerprint))throw Error('Invalid audio');
await tx`INSERT INTO company_spy_transcriptions(company_id,fingerprint,record) VALUES(${p.company},${r.fingerprint},${tx.json(r)}) ON CONFLICT DO NOTHING`;
const [saved]=await tx`SELECT record FROM company_spy_transcriptions WHERE company_id=${p.company} AND fingerprint=${r.fingerprint}`;
if(saved.record.status!=='complete'||!eq(saved.record.analysis,r.analysis)||saved.record.model!==r.model)throw Error('Audio conflict');
}
for(const d of p.documents){
if(!/^(creative-media\/[a-f0-9]{64}\.json|creative-learning\/(bulk-analysis|niches|notes|observations)\.json)$/.test(d.name))throw Error('Invalid document');
await tx`INSERT INTO company_creative_documents(company_id,name,document) VALUES(${p.company},${d.name},${tx.json(d.document)}) ON CONFLICT DO NOTHING`;
const [saved]=await tx`SELECT document FROM company_creative_documents WHERE company_id=${p.company} AND name=${d.name}`;
if(!eq(saved.document,d.document))throw Error('Document conflict');
}
console.log(JSON.stringify({verifiedCreatives:256,verifiedVisualRecords:p.records.length,verifiedAudio:p.transcriptions.length,verifiedDocuments:p.documents.length,newProviderRequests:0}));
await tx`INSERT INTO company_creative_documents(company_id,name,document) VALUES(${p.company},'creative-learning/release.json',${tx.json({ready:true,importedLogicalCreatives:256})}) ON CONFLICT(company_id,name) DO UPDATE SET document=excluded.document,updated_at=now()`;
});}finally{await sql.end();}
}
const remote=`(${importRemote.toString()})().catch(e=>{console.error('CREATIVE_TRANSFER_FAILED',e.message);process.exitCode=1})`;
const output=execFileSync('railway',['ssh','--project','3704cd93-6011-4e5f-be52-f229b499b018','--environment','production','--service','@page-cloner/api','--','node','-e',remote],{input:encoded.toString('base64'),encoding:'utf8',maxBuffer:1000000,timeout:240000});
console.log(output);
await writeFile(join(root,'creative-learning',company,'production-transfer-receipt.json'),JSON.stringify({...summary,at:new Date().toISOString(),output}),{mode:0o600});
