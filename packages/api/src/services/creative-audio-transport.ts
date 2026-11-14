import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { audioAnalysisRequest } from './spy-audio-analysis.js';

export async function creativeAudioTransport(audio: string) {
  const directory = await mkdtemp(join(tmpdir(), 'tmx-audio-wire-'));
  try {
    const source=join(directory,'source.wav'),target=join(directory,'audio.mp3');
    await writeFile(source,Buffer.from(audio,'base64'),{mode:0o600});
    await promisify(execFile)(process.platform==='darwin'?'/opt/homebrew/bin/ffmpeg':'/usr/bin/ffmpeg',
      ['-v','error','-nostdin','-protocol_whitelist','file','-i',source,'-vn','-ac','1','-ar','16000','-c:a','libmp3lame','-b:a','64k',target],{timeout:30000,maxBuffer:10000});
    const body=audioAnalysisRequest(audio);
    // Fingerprints use the canonical WAV; compression changes only the provider transport.
    return {...body,messages:[body.messages[0],{role:'user',content:[{type:'input_audio',input_audio:{format:'mp3',data:(await readFile(target)).toString('base64')}}]}]};
  } finally { await rm(directory,{recursive:true,force:true}); }
}
