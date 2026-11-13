import { execFileSync } from 'node:child_process';
// Explicit release utility: transfers existing paid results, never credentials or new AI requests.
import { readFile, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
const company = '69706e9a-95ad-493e-b4ab-4a6de7541adc';
const offer = '995e6bfd-8c26-47fb-9614-0a02a7dd97b0';
const base = join(homedir(), '.codex/local-data/tmx/ai-preview');
const mode = process.argv[2];
if (!['web', 'api'].includes(mode)) throw Error('Choose web or api explicitly');
const source = join(base, 'spy-visual-source', company);
const payload = { company, offer };
if (mode === 'web') {
  payload.frames = {};
  for (const file of await readdir(join(source, 'frames'))) {
    if (/^[a-f0-9]{64}\.json$/.test(file))
      payload.frames[file] = JSON.parse(await readFile(join(source, 'frames', file), 'utf8'));
  }
  payload.references = JSON.parse(
    await readFile(join(source, 'recovered-references.json'), 'utf8'),
  );
} else {
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
const script = `
const fs=require('node:fs/promises'),zlib=require('node:zlib'),crypto=require('node:crypto');
(async()=>{const chunks=[];for await(const c of process.stdin)chunks.push(c);
const p=JSON.parse(zlib.gunzipSync(Buffer.from(Buffer.concat(chunks).toString(),'base64')));
if(p.company!==${JSON.stringify(company)}||p.offer!==${JSON.stringify(offer)})throw Error('scope');
if(p.frames){const root='/data/spy/visual/'+p.company;await fs.mkdir(root+'/frames',{recursive:true,mode:0o700});
for(const [name,frames] of Object.entries(p.frames)){
if(!/^[a-f0-9]{64}\\.json$/.test(name)||!Array.isArray(frames)||frames.length>6||frames.length<1||frames.some(f=>!Number.isFinite(f.second)||!/^data:image\\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(f.image)))throw Error('frames');
const data=JSON.stringify(frames);try{await fs.writeFile(root+'/frames/'+name,data,{flag:'wx',mode:0o600})}catch(e){if(e.code!=='EEXIST')throw e;if(JSON.stringify(JSON.parse(await fs.readFile(root+'/frames/'+name,'utf8')))!==data)throw Error('cache conflict');}}
await fs.mkdir(root+'/'+p.offer,{recursive:true,mode:0o700});
const target=root+'/'+p.offer+'/recovered-references.json';
try{await fs.writeFile(target,JSON.stringify(p.references),{flag:'wx',mode:0o600})}catch(e){if(e.code!=='EEXIST')throw e;if(JSON.stringify(JSON.parse(await fs.readFile(target,'utf8')))!==JSON.stringify(p.references))throw Error('references conflict');}
console.log(JSON.stringify({savedFrames:Object.keys(p.frames).length,references:Object.keys(p.references.references).length}));
}else{const sql=require('postgres')(process.env.DATABASE_URL,{max:1});try{
await sql.begin(async tx=>{for(const r of p.records){if(r.companyId!==p.company||r.offerId!==p.offer||r.status!=='complete'||!/^[a-f0-9]{64}$/.test(r.key))throw Error('record');await tx\`INSERT INTO company_spy_visual_analyses(company_id,fingerprint,offer_id,record) VALUES(\${p.company},\${r.key},\${p.offer},\${tx.json(r)}) ON CONFLICT DO NOTHING\`;}
const rows=await tx\`SELECT record FROM company_spy_visual_analyses WHERE company_id=\${p.company} AND offer_id=\${p.offer}\`;
if(!p.records.every(r=>rows.some(x=>x.record.key===r.key&&x.record.status==='complete')))throw Error('missing imported result');console.log(JSON.stringify({savedAnalyses:rows.length}));});
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
