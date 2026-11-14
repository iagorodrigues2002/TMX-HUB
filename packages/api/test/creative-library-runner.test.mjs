import assert from 'node:assert/strict';
import { test } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

for(const stopping of [false,true])test(`batch bounds concurrency, skips saved analyses and drains on stop=${stopping}`, async () => {
  const home=await mkdtemp(join(tmpdir(),'tmx-creative-runner-'));
  try {
    const loader=join(home,'mock.mjs');
    await writeFile(loader, `
      import assert from 'node:assert/strict';
      import http from 'node:http';
      import {syncBuiltinESMExports} from 'node:module';
      import {EventEmitter} from 'node:events';
      let active=0,peak=0;const seen=new Set();
      const items=Array.from({length:8},(_,i)=>({key:'key'+i,fileId:'file'+i,offer:'PJR_ENG',analyzed:i===0}));
      globalThis.fetch=async(url,opts)=>{
        if(url.endsWith('/auth/login'))return Response.json({token:'fixture'});
        if(url.endsWith('/inventory'))return Response.json({companyId:'69706e9a-95ad-493e-b4ab-4a6de7541adc',items});
        const item=JSON.parse(opts.body);assert.notEqual(item.key,'key0');assert(!seen.has(item.key));seen.add(item.key);
        peak=Math.max(peak,++active);assert(active<=3);
        if(${stopping}&&seen.size===1)process.kill(process.pid,'SIGTERM');
        await new Promise(r=>setTimeout(r,10));active--;
        return Response.json({analysis:{at:'fixture'}});
      };
      http.request=(url,options,callback)=>{
        assert(options.signal);
        const req=new EventEmitter();req.end=async body=>{
          const response=await globalThis.fetch(url,{body});
          const res=new EventEmitter();res.statusCode=response.status;res.setEncoding=()=>{};
          callback(res);res.emit('data',await response.text());res.emit('end');
        };return req;
      };
      syncBuiltinESMExports();
      process.on('exit',()=>{assert.equal(seen.size,${stopping?3:7});assert.equal(peak,3);});
    `);
    await promisify(execFile)(process.execPath,['--import',loader,new URL('../scripts/analyze-local-creative-library.mjs',import.meta.url).pathname],{env:{...process.env,HOME:home,TMX_PREVIEW_EMAIL:'fixture',TMX_PREVIEW_PASSWORD:'fixture'},timeout:10000});
    const state=JSON.parse(await readFile(join(home,'.codex/local-data/tmx/ai-preview/creative-learning/69706e9a-95ad-493e-b4ab-4a6de7541adc/bulk-analysis.json'),'utf8'));
    assert.equal(state.status,stopping?'paused':'complete');
    assert.equal(state.items.filter(i=>i.state==='complete').length,stopping?4:8);
    assert.equal(state.items.filter(i=>i.state==='processing').length,0);
  } finally { await rm(home,{recursive:true,force:true}); }
});
