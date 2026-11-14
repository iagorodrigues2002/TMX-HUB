import { test } from 'vitest';
import assert from 'node:assert/strict';
import { parseProviderRequest, parseCurlResponse, providerJsonRequest, providerAudioBody } from '../scripts/ai-preview-bridge.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { audioAnalysisRequest } from '../src/services/spy-audio-analysis.ts';
test('audio transport compresses the full WAV without changing its canonical cache input',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'tmx-audio-transport-'));
 try{
  const wav=Buffer.alloc(32044);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(16000,24);wav.writeUInt32LE(32000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(32000,40);
  const body=audioAnalysisRequest(wav.toString('base64'));
  const result=await providerAudioBody(body,dir);
  assert.equal(body.messages[1].content[0].input_audio.format,'wav');
  assert.equal(result.messages[1].content[0].input_audio.format,'mp3');
  const encoded=Buffer.from(result.messages[1].content[0].input_audio.data,'base64');
  assert(encoded.length>1000&&encoded.length<wav.length);assert.equal(encoded.toString('ascii',0,3),'ID3');
  const duration=Number(execFileSync(process.platform==='darwin'?'/opt/homebrew/bin/ffprobe':'/usr/bin/ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',join(dir,'audio.mp3')],{encoding:'utf8'}));
  assert(duration>=1&&duration<1.2);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('provider transport preserves response status and rejects arbitrary destinations and header injection',async()=>{
  const response=parseCurlResponse('{"ok":true}\n200');
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true});
  assert.equal(parseCurlResponse('{"error":"temporary"}\n502').status,502);
  assert.throws(()=>parseCurlResponse('broken'));
  await assert.rejects(()=>providerJsonRequest('https://127.0.0.1/private','Bearer fixture',{}));
  await assert.rejects(()=>providerJsonRequest('/responses','Bearer fixture\r\nother: bad',{}));
});
test('bridge accepts bounded inline frames, rejects external URLs and tools', () => {
  const audio = audioAnalysisRequest('YWJj');
  assert.equal(parseProviderRequest('/audio-analysis', audio).success, true);
  assert.equal(parseProviderRequest('/audio-analysis', { ...audio, store: true }).success, false);
  assert.equal(parseProviderRequest('/audio-analysis', { ...audio, tools: [] }).success, false);
  assert.equal(parseProviderRequest('/transcriptions', { model: 'gpt-transcribe', audio: 'YWJj' }).success, true);
  assert.equal(parseProviderRequest('/transcriptions', { model: 'gpt-transcribe', audio: 'https://example.com/audio' }).success, false);
  assert.equal(parseProviderRequest('/transcriptions', { model: 'other', audio: 'YWJj' }).success, false);
  const body = { model: 'gpt-6.1-sol', instructions: 'Compare', input: [{ role: 'user', content: [{ type: 'input_image', image_url: 'data:image/jpeg;base64,YWJj', detail: 'high' }] }], store: false, service_tier: 'default', prompt_cache_options: { mode: 'explicit' }, reasoning: { effort: 'low' }, max_output_tokens: 3000 };
  assert.equal(parseProviderRequest('/responses', body).success, true);
  assert.equal(parseProviderRequest('/responses', { ...body, tools: [{ type: 'web_search' }] }).success, false);
  assert.equal(parseProviderRequest('/responses', { ...body, input: [{ role: 'user', content: [{ type: 'input_image', image_url: 'https://example.com/private.jpg', detail: 'high' }] }] }).success, false);
  assert.equal(parseProviderRequest('/responses', { ...body, store: true }).success, false);
});
