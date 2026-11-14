// The sandboxed preview can reach only localhost. This bridge permits one fixed provider and a fixed read-only exporter.
import { createServer } from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { searchCreativeTrends } from './creative-trends.mjs';
const visualContent=z.array(z.union([z.object({type:z.literal('input_text'),text:z.string().max(7000)}).strict(),z.object({type:z.literal('input_image'),image_url:z.string().max(350000).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/),detail:z.literal('high')}).strict()])).max(26);
const core={model:z.literal('gpt-6.1-sol'),instructions:z.string().max(10000),input:z.array(z.object({role:z.literal('user'),content:z.union([z.string().max(8000000),visualContent])}).strict()).length(1)};
const countSchema=z.object(core).strict();
const responseSchema=z.object({...core,store:z.literal(false),service_tier:z.literal('default'),prompt_cache_options:z.object({mode:z.literal('explicit')}).strict(),reasoning:z.object({effort:z.literal('low')}).strict(),max_output_tokens:z.literal(3000),text:z.object({format:z.object({type:z.literal('json_schema'),name:z.literal('spy_visual_comparison'),strict:z.literal(true),schema:z.record(z.string(),z.unknown())}).strict()}).strict().optional()}).strict();
const transcriptionSchema=z.object({model:z.literal('gpt-transcribe'),audio:z.string().max(25610000).regex(/^[A-Za-z0-9+/]+=*$/)}).strict();
const audioAnalysisSchema=z.object({model:z.literal('gpt-audio-1.5'),store:z.literal(false),modalities:z.tuple([z.literal('text')]),max_completion_tokens:z.literal(16000),messages:z.tuple([z.object({role:z.literal('system'),content:z.string().max(4000)}).strict(),z.object({role:z.literal('user'),content:z.tuple([z.object({type:z.literal('input_audio'),input_audio:z.object({data:z.string().max(76810000).regex(/^[A-Za-z0-9+/]+=*$/),format:z.literal('wav')}).strict()}).strict()])}).strict()])}).strict();
export function parseProviderRequest(path,raw){return (path==='/audio-analysis'?audioAnalysisSchema:path==='/transcriptions'?transcriptionSchema:path==='/responses'?responseSchema:countSchema).safeParse(raw);}
export function parseCurlResponse(stdout){const split=stdout.lastIndexOf('\n');const status=Number(stdout.slice(split+1));if(split<0||!Number.isInteger(status)||status<100||status>599)throw Error('Invalid provider transport response');return new Response(stdout.slice(0,split),{status});}
export async function providerAudioBody(body,dir){
 const input=join(dir,'audio.wav'),output=join(dir,'audio.mp3');
 await writeFile(input,Buffer.from(body.messages[1].content[0].input_audio.data,'base64'),{mode:0o600});
 await promisify(execFile)(process.platform==='darwin'?'/opt/homebrew/bin/ffmpeg':'/usr/bin/ffmpeg',['-v','error','-nostdin','-protocol_whitelist','file','-i',input,'-vn','-ac','1','-ar','16000','-c:a','libmp3lame','-b:a','64k',output],{timeout:30000,maxBuffer:10000});
 const audio=await readFile(output);
 return {...body,messages:[body.messages[0],{...body.messages[1],content:[{type:'input_audio',input_audio:{format:'mp3',data:audio.toString('base64')}}]}]};
}
// The local Node TLS transport intermittently resets large requests. curl keeps certificate validation enabled.
export async function providerJsonRequest(path,authorization,body,requestId){
 if(!['/chat/completions','/responses','/responses/input_tokens'].includes(path)||!/^Bearer [^\s]+$/.test(authorization))throw Error('Invalid provider destination');
 const dir=await mkdtemp(join(tmpdir(),'tmx-provider-'));
 try{
  if(path==='/chat/completions')body=await providerAudioBody(body,dir);
  const file=join(dir,'body.json');await writeFile(file,JSON.stringify(body),{mode:0o600});
  const result=promisify(execFile)('/usr/bin/curl',['--silent','--show-error','--proto','=https','--max-time','90','--connect-timeout','15','--request','POST','--url','https://api.openai.com/v1'+path,'--header','@-','--data-binary','@'+file,'--write-out','\n%{http_code}'],{timeout:95000,maxBuffer:2000000});
  result.child.stdin.end('authorization: '+authorization+'\ncontent-type: application/json\n'+(typeof requestId==='string'&&/^[a-f0-9-]{36}$/.test(requestId)?'X-Client-Request-Id: '+requestId+'\n':''));
  const {stdout}=await result;return parseCurlResponse(stdout);
 }finally{await rm(dir,{recursive:true,force:true});}
}
let sync;
export function createAiBridge(){return createServer(async(req,res)=>{
 const send=(status,body)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(body));};
 try{
  const master=await readFile(join(homedir(),'.codex/local-data/tmx/ai-preview/secret'),'utf8');
  const expected=createHmac('sha256',master).update('tmx-ai-bridge:v1').digest('hex');
  const actual=req.headers['x-tmx-ai-secret'];
  if(typeof actual!=='string'||Buffer.byteLength(actual)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(actual),Buffer.from(expected)))return send(403,{error:'Forbidden'});
  if(req.method!=='POST')return send(405,{error:'Method not allowed'});
  if(req.url==='/creative-trends'){
   const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>4096)return send(413,{error:'Request too large'});chunks.push(chunk);}
   try{return send(200,await searchCreativeTrends(JSON.parse(Buffer.concat(chunks).toString())));}catch(e){return send(422,{detail:e.message});}
  }
  if(req.url==='/refresh'){
   sync??=promisify(execFile)(process.execPath,[fileURLToPath(new URL('./sync-ai-preview.mjs',import.meta.url))],{timeout:180000,maxBuffer:100000}).finally(()=>{sync=undefined;});
   await sync;return send(200,{updated:true});
  }
  if(req.url!=='/responses'&&req.url!=='/input-tokens'&&req.url!=='/transcriptions'&&req.url!=='/audio-analysis')return send(404,{error:'Not found'});
  let size=0;const chunks=[];
  for await(const chunk of req){size+=chunk.length;if(size>(req.url==='/audio-analysis'?76900000:req.url==='/transcriptions'?25700000:8000000))return send(413,{error:'Request too large'});chunks.push(chunk);}
  const parsed=parseProviderRequest(req.url,JSON.parse(Buffer.concat(chunks).toString()));
  if(!parsed.success)return send(400,{error:'Unsupported request'});
  const body=parsed.data;
  if(!/^Bearer [^\s]+$/.test(req.headers.authorization??''))return send(400,{error:'Missing credential'});
  if(req.url==='/transcriptions'){
   const form=new FormData();form.set('model',body.model);form.set('file',new Blob([Buffer.from(body.audio,'base64')],{type:'audio/wav'}),'audio.wav');
   const response=await fetch('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{authorization:req.headers.authorization},body:form,redirect:'error',signal:AbortSignal.timeout(90000)});
   if(!response.ok)return send(response.status,{error:'Provider rejected request'});
   return send(200,await response.json());
  }
  if(req.url==='/audio-analysis'){
   const response=await providerJsonRequest('/chat/completions',req.headers.authorization,body);
   if(!response.ok)return send(response.status,{error:'Provider rejected request'});
   return send(200,await response.json());
  }
  const response=await providerJsonRequest(req.url==='/responses'?'/responses':'/responses/input_tokens',req.headers.authorization,body,req.headers['x-client-request-id']);
  if(!response.ok)return send(response.status,{error:'Provider rejected request'});
  const providerId=response.headers.get('x-request-id');if(providerId)res.setHeader('x-request-id',providerId);
  send(200,await response.json());
 }catch(error){console.error(JSON.stringify({event:'bridge_failure',path:req.url,name:error?.name,code:error?.cause?.code??error?.code}));send(502,{error:'Local bridge unavailable'});}
});}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))createAiBridge().listen(4121,'127.0.0.1',()=>console.log('TMX AI local bridge ready on loopback'));
