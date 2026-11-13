import { createRequire } from 'node:module';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const packages=await readdir(new URL('../node_modules/.pnpm',import.meta.url));
const sharp=require(new URL('../node_modules/.pnpm/'+packages.find(p=>p.startsWith('sharp@'))+'/node_modules/sharp',import.meta.url).pathname);
const root=join(homedir(),'.codex/local-data/tmx/ai-preview/spy-visual-source/69706e9a-95ad-493e-b4ab-4a6de7541adc');
const source=JSON.parse(await readFile(join(root,'source.json'),'utf8'));
const images=JSON.parse(await readFile(join(root,'thumbnails-recovery.json'),'utf8'));
let fingerprints={};try{fingerprints=JSON.parse(await readFile(join(root,'thumbnail-fingerprints.json'),'utf8'))}catch{}
for(const [digest,image] of Object.entries(images.images)) {
  if(fingerprints[digest])continue;
  try { const pixels=await sharp(Buffer.from(image,'base64')).resize(9,8,{fit:'fill'}).greyscale().removeAlpha().raw().toBuffer();
    let hash=0n;for(let y=0;y<8;y++)for(let x=0;x<8;x++)hash=(hash<<1n)|(pixels[y*9+x]>pixels[y*9+x+1]?1n:0n);
    const mean=pixels.reduce((a,b)=>a+b,0)/pixels.length;
    fingerprints[digest]={hash:hash.toString(16).padStart(16,'0'),contrast:Math.sqrt(pixels.reduce((a,b)=>a+(b-mean)**2,0)/pixels.length)};
  }catch{fingerprints[digest]={error:'invalid_image'}}
}
await writeFile(join(root,'thumbnail-fingerprints.json'),JSON.stringify(fingerprints),{mode:0o600});
const login=await fetch('http://127.0.0.1:4110/v1/auth/login',{method:'POST',headers:{'content-type':'application/json',origin:'http://localhost:3120'},body:JSON.stringify({email:'admin@native.tmx.test',password:'Synthetic-preview-2026!'})});
const {token}=await login.json();const r=await fetch('http://localhost:3120/api/spy-visual',{headers:{authorization:'Bearer '+token}});if(!r.ok)throw Error('Local preview denied access');const list=await r.json();
const current=source.job.snapshots.at(-1);
const history=[...new Map(source.job.snapshots.slice(0,-1).filter(s=>s.scope===current.scope).flatMap(s=>s.ads.map(ad=>[ad.id,{ad,at:s.at}]))).values()];
const print=ad=>fingerprints[images.aliases[ad.thumbnailKey]];
const distance=(a,b)=>{let n=BigInt('0x'+a)^BigInt('0x'+b),count=0;while(n){n&=n-1n;count++}return count};
assert.equal(distance('0000000000000000','ffffffffffffffff'),64);assert.equal(distance('ff00','ff00'),0);
const references={},unresolved=[],candidates={};
for(const item of list.ads.filter(a=>!a.previous||a.recoveredReference||!history.find(h=>h.ad.id===a.previous.id)?.ad.creativeAssets?.length)){
  const ad=current.ads.find(a=>a.id===item.id),fp=print(ad);
  if(!fp?.hash||fp.contrast<8){unresolved.push({id:ad.id,reason:'Miniatura ausente ou sem detalhe suficiente para encontrar uma referência segura.'});continue;}
  const ranked=history.filter(h=>h.ad.id!==ad.id&&print(h.ad)?.hash&&print(h.ad).contrast>=8).map(h=>({...h,distance:distance(fp.hash,print(h.ad).hash)})).sort((a,b)=>a.distance-b.distance||a.ad.id.localeCompare(b.ad.id));
  candidates[ad.id]=ranked.slice(0,3).map(h=>({id:h.ad.id,at:h.at,distance:h.distance,hasMedia:!!h.ad.creativeAssets?.length}));
  const best=ranked.find(h=>h.distance<=12&&h.ad.creativeAssets?.length===1&&h.ad.creativeComplete);
  if(best)references[ad.id]={id:best.ad.id,at:best.at,pageName:best.ad.pageName,distance:best.distance,method:'thumbnail_similarity'};
  else unresolved.push({id:ad.id,reason:ranked[0]?.distance<=12?'A miniatura sugere uma referência, mas a mídia histórica continua indisponível após recuperação.':'Não encontrei referência visual suficientemente próxima entre as miniaturas históricas disponíveis. Não é confirmação de criativo novo.'});
}
const data={at:new Date().toISOString(),references,unresolved,candidates,historicalCount:history.length,uniqueThumbnails:Object.keys(fingerprints).length};
for(const [id,ref] of Object.entries(references)){assert.notEqual(id,ref.id);assert(ref.distance<=12);assert(history.some(h=>h.ad.id===ref.id&&h.at===ref.at&&h.ad.creativeComplete));}
await writeFile(join(root,'recovered-references.json'),JSON.stringify(data,null,2),{mode:0o600});
console.log(JSON.stringify({references:Object.keys(references).length,unresolved:unresolved.length,distances:Object.values(references).map(r=>r.distance),historicalCount:history.length,uniqueThumbnails:data.uniqueThumbnails}));
