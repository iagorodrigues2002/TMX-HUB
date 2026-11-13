import { execFileSync } from 'node:child_process';
// Explicit release utility: transfers existing paid results, never credentials or new AI requests.
import { readFile, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
const company = '69706e9a-95ad-493e-b4ab-4a6de7541adc';
const offer = '995e6bfd-8c26-47fb-9614-0a02a7dd97b0';
const base = join(homedir(), '.codex/local-data/tmx/ai-preview');
const mode = process.argv[2];
if (!['web', 'api'].includes(mode)) throw Error('Choose web or api explicitly');
const source = join(base, 'spy-visual-source', company);
const payload = { company, offer };
const audio = {};
const fingerprints = new Set();
for (const file of await readdir(join(source, 'audio'))) {
  if (!/^[a-f0-9]{64}\.wav$/.test(file)) continue;
  const bytes = await readFile(join(source, 'audio', file));
  if (bytes.length > 19201000 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') throw Error('Invalid audio cache');
  audio[file] = bytes.toString('base64');
  for (const model of ['gpt-transcribe', 'gpt-audio-1.5']) fingerprints.add(createHash('sha256').update(`${model}:v1:`).update(bytes).digest('hex'));
}
if (mode === 'web') {
  payload.audio = audio;
  payload.frames = {};
  for (const file of await readdir(join(source, 'frames'))) {
    if (/^[a-f0-9]{64}\.json$/.test(file))
      payload.frames[file] = JSON.parse(await readFile(join(source, 'frames', file), 'utf8'));
  }
  payload.references = JSON.parse(
    await readFile(join(source, 'recovered-references.json'), 'utf8'),
  );
} else {
  payload.transcriptions = [];
  for (const file of await readdir(join(base, 'spy-transcription', company))) {
    if (!/^[a-f0-9]{64}\.json$/.test(file) || !fingerprints.has(file.slice(0, 64))) continue;
    const r = JSON.parse(await readFile(join(base, 'spy-transcription', company, file), 'utf8'));
    if (r.status !== 'complete' || r.companyId !== company || r.fingerprint !== file.slice(0, 64)) throw Error('Invalid transcription');
    payload.transcriptions.push({ status: r.status, companyId: company, fingerprint: r.fingerprint, model: r.model, text: r.text, duration: r.duration, at: r.at, analysis: r.analysis, costMicros: r.costMicros ?? Math.round(r.estimatedCostUsd * 1e6), costReserved: r.costReserved ?? false });
  }
  payload.records = [];
  for (const file of await readdir(join(base, 'spy-visual', company))) {
    if (!/^[a-f0-9]{64}\.json$/.test(file)) continue;
    const record = JSON.parse(await readFile(join(base, 'spy-visual', company, file), 'utf8'));
    if (
      record.status !== 'complete' ||
      record.companyId !== company ||
      record.offerId !== offer ||
      `${record.key}.json` !== file
    )
      throw Error('Invalid cache record');
    payload.records.push(record);
  }
}
if (process.argv.includes('--dry-run')) {
  console.log(JSON.stringify({ mode, frames: Object.keys(payload.frames ?? {}).length, audio: Object.keys(payload.audio ?? {}).length, analyses: payload.records?.length ?? 0, transcriptions: payload.transcriptions?.length ?? 0, compressedBytes: gzipSync(JSON.stringify(payload)).length }));
  process.exit(0);
}
const script = `
const fs=require('node:fs/promises'),zlib=require('node:zlib'),crypto=require('node:crypto');
(async()=>{const chunks=[];for await(const c of process.stdin)chunks.push(c);
const p=JSON.parse(zlib.gunzipSync(Buffer.from(Buffer.concat(chunks).toString(),'base64')));
if(p.company!==${JSON.stringify(company)}||p.offer!==${JSON.stringify(offer)})throw Error('scope');
if(p.frames){const root='/data/spy/visual/'+p.company;await fs.mkdir(root+'/frames',{recursive:true,mode:0o700});
await fs.mkdir(root+'/audio',{recursive:true,mode:0o700});
for(const [name,encoded] of Object.entries(p.audio)){const bytes=Buffer.from(encoded,'base64');if(!/^[a-f0-9]{64}\\.wav$/.test(name)||bytes.length>19201000||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WAVE')throw Error('audio');try{await fs.writeFile(root+'/audio/'+name,bytes,{flag:'wx',mode:0o600})}catch(e){if(e.code!=='EEXIST')throw e;if(!(await fs.readFile(root+'/audio/'+name)).equals(bytes))throw Error('audio conflict');}}
for(const [name,frames] of Object.entries(p.frames)){
if(!/^[a-f0-9]{64}\\.json$/.test(name)||!Array.isArray(frames)||frames.length>6||frames.length<1||frames.some(f=>!Number.isFinite(f.second)||!/^data:image\\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(f.image)))throw Error('frames');
const data=JSON.stringify(frames);try{await fs.writeFile(root+'/frames/'+name,data,{flag:'wx',mode:0o600})}catch(e){if(e.code!=='EEXIST')throw e;if(JSON.stringify(JSON.parse(await fs.readFile(root+'/frames/'+name,'utf8')))!==data)throw Error('cache conflict');}}
await fs.mkdir(root+'/'+p.offer,{recursive:true,mode:0o700});
const target=root+'/'+p.offer+'/recovered-references.json';
try{await fs.writeFile(target,JSON.stringify(p.references),{flag:'wx',mode:0o600})}catch(e){if(e.code!=='EEXIST')throw e;if(JSON.stringify(JSON.parse(await fs.readFile(target,'utf8')))!==JSON.stringify(p.references))throw Error('references conflict');}
console.log(JSON.stringify({savedFrames:Object.keys(p.frames).length,savedAudio:Object.keys(p.audio).length,references:Object.keys(p.references.references).length}));
}else{const sql=require('postgres')(process.env.DATABASE_URL,{max:1});try{
await sql.begin(async tx=>{for(const r of p.records){if(r.companyId!==p.company||r.offerId!==p.offer||r.status!=='complete'||!/^[a-f0-9]{64}$/.test(r.key))throw Error('record');await tx\`INSERT INTO company_spy_visual_analyses(company_id,fingerprint,offer_id,record) VALUES(\${p.company},\${r.key},\${p.offer},\${tx.json(r)}) ON CONFLICT DO NOTHING\`;}
const rows=await tx\`SELECT record FROM company_spy_visual_analyses WHERE company_id=\${p.company} AND offer_id=\${p.offer}\`;
if(!p.records.every(r=>rows.some(x=>x.record.key===r.key&&x.record.status==='complete')))throw Error('missing imported result');
for(const r of p.transcriptions){if(r.companyId!==p.company||r.status!=='complete'||!/^[a-f0-9]{64}$/.test(r.fingerprint))throw Error('transcription');await tx\`INSERT INTO company_spy_transcriptions(company_id,fingerprint,record) VALUES(\${p.company},\${r.fingerprint},\${tx.json(r)}) ON CONFLICT DO NOTHING\`;const saved=await tx\`SELECT record FROM company_spy_transcriptions WHERE company_id=\${p.company} AND fingerprint=\${r.fingerprint}\`;if(saved[0]?.record.status!=='complete'||saved[0]?.record.text!==r.text)throw Error('transcription conflict');}
console.log(JSON.stringify({savedAnalyses:rows.length,savedTranscriptions:p.transcriptions.length}));});
}finally{await sql.end();}}
})().catch(e=>{console.error('CACHE_TRANSFER_FAILED',e.message);process.exitCode=1});`;
const output = execFileSync(
  'railway',
  [
    'ssh',
    '--project',
    '3704cd93-6011-4e5f-be52-f229b499b018',
    '--environment',
    'production',
    '--service',
    `@page-cloner/${mode}`,
    '--',
    'node',
    '-e',
    script,
  ],
  {
    input: gzipSync(JSON.stringify(payload)).toString('base64'),
    encoding: 'utf8',
    timeout: 180000,
    maxBuffer: 100000,
  },
);
console.log(
  output
    .split('\n')
    .filter((line) => line.startsWith('{'))
    .join('\n'),
);
