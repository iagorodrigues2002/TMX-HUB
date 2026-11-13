// The sandboxed preview can reach only localhost. This bridge permits one fixed provider and a fixed read-only exporter.
import { createServer } from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
const core={model:z.literal('gpt-6.1-sol'),instructions:z.string().max(10000),input:z.array(z.object({role:z.literal('user'),content:z.string().max(210000)}).strict()).length(1)};
const countSchema=z.object(core).strict();
const responseSchema=z.object({...core,store:z.literal(false),service_tier:z.literal('default'),prompt_cache_options:z.object({mode:z.literal('explicit')}).strict(),reasoning:z.object({effort:z.literal('low')}).strict(),max_output_tokens:z.literal(3000)}).strict();
export function parseProviderRequest(path,raw){return (path==='/responses'?responseSchema:countSchema).safeParse(raw);}
let sync;
export function createAiBridge(){return createServer(async(req,res)=>{
 const send=(status,body)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(body));};
 try{
  const master=await readFile(join(homedir(),'.codex/local-data/tmx/ai-preview/secret'),'utf8');
  const expected=createHmac('sha256',master).update('tmx-ai-bridge:v1').digest('hex');
  const actual=req.headers['x-tmx-ai-secret'];
  if(typeof actual!=='string'||Buffer.byteLength(actual)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(actual),Buffer.from(expected)))return send(403,{error:'Forbidden'});
  if(req.method!=='POST')return send(405,{error:'Method not allowed'});
  if(req.url==='/refresh'){
   sync??=promisify(execFile)(process.execPath,[fileURLToPath(new URL('./sync-ai-preview.mjs',import.meta.url))],{timeout:180000,maxBuffer:100000}).finally(()=>{sync=undefined;});
   await sync;return send(200,{updated:true});
  }
  if(req.url!=='/responses'&&req.url!=='/input-tokens')return send(404,{error:'Not found'});
  let size=0;const chunks=[];
  for await(const chunk of req){size+=chunk.length;if(size>220000)return send(413,{error:'Request too large'});chunks.push(chunk);}
  const parsed=parseProviderRequest(req.url,JSON.parse(Buffer.concat(chunks).toString()));
  if(!parsed.success)return send(400,{error:'Unsupported request'});
  const body=parsed.data;
  if(!/^Bearer [^\s]+$/.test(req.headers.authorization??''))return send(400,{error:'Missing credential'});
  const requestId=req.headers['x-client-request-id'];
  const response=await fetch(req.url==='/responses'?'https://api.openai.com/v1/responses':'https://api.openai.com/v1/responses/input_tokens',{method:'POST',headers:{authorization:req.headers.authorization,'content-type':'application/json',...(typeof requestId==='string'&&/^[a-f0-9-]{36}$/.test(requestId)?{'X-Client-Request-Id':requestId}:{})},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(req.url==='/responses'?90000:25000)});
  if(!response.ok)return send(response.status,{error:'Provider rejected request'});
  const providerId=response.headers.get('x-request-id');if(providerId)res.setHeader('x-request-id',providerId);
  send(200,await response.json());
 }catch{send(502,{error:'Local bridge unavailable'});}
});}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))createAiBridge().listen(4121,'127.0.0.1',()=>console.log('TMX AI local bridge ready on loopback'));
