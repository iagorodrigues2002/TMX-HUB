import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { creativeFrameTimes, driveCreativeMedia, safeDriveDownload } from '../src/lib/drive-creative-media';
test('frames stop at the video end when audio runs longer', async () => {
  const root=await mkdtemp(join(tmpdir(),'tmx-media-tail-'));
  try {
    const file=join(root,'fixture.mp4');
    execFileSync(process.platform==='darwin'?'/opt/homebrew/bin/ffmpeg':'/usr/bin/ffmpeg', ['-v','error','-f','lavfi','-i','color=c=black:s=64x64:r=25:d=2','-f','lavfi','-i','sine=frequency=440:duration=3','-c:v','libx264','-c:a','aac',file]);
    const bytes=await readFile(file);
    const media=await driveCreativeMedia(join(root,'cache'),'fixturefileid',async(_,options)=>{
      assert.equal(new Headers(options?.headers).get('range'),'bytes=0-');
      return new Response(bytes,{status:206,headers:{'content-range':`bytes 0-${bytes.length-1}/${bytes.length}`}});
    });
    assert.ok(media.duration>=3);
    assert.ok(media.frames.length>=2);
    assert.ok(media.frames.every(f=>f.second<2));
    assert.ok(media.audio);
    const cached=await driveCreativeMedia(join(root,'cache'),'fixturefileid',async()=>new Response(bytes));
    assert.deepEqual(cached,media);
    assert.deepEqual(await readdir(join(root,'cache')),[`${media.hash}.json`]);
  } finally {await rm(root,{recursive:true,force:true});}
});
test('long creatives prioritize the opening and retain a final reference without assuming a countdown', () => {
  assert.deepEqual(creativeFrameTimes(305), [0,2,4.9,10,20,304.85]);
  assert.ok(creativeFrameTimes(5).every(t=>t>=0 && t<5));
  assert.throws(()=>creativeFrameTimes(NaN));
});
test('large Drive media preserves its full hash and removes temporary files', async () => {
  const root=await mkdtemp(join(tmpdir(),'tmx-range-media-'));
  try {
    const file=join(root,'fixture.mp4');
    execFileSync(process.platform==='darwin'?'/opt/homebrew/bin/ffmpeg':'/usr/bin/ffmpeg',['-v','error','-f','lavfi','-i','color=c=black:s=64x64:r=25:d=1','-c:v','libx264',file]);
    const bytes=Buffer.concat([await readFile(file),Buffer.alloc(33*1024*1024)]);
    const fetcher=async()=>new Response(bytes,{status:206,headers:{'content-range':`bytes 0-${bytes.length-1}/${bytes.length}`}});
    const result=await driveCreativeMedia(join(root,'cache'),'fixturefileid',fetcher);
    assert.equal(result.hash,createHash('sha256').update('creative-opening-v2:').update(bytes).digest('hex'));
    assert.deepEqual(await readdir(join(root,'cache')),[`${result.hash}.json`]);
  } finally {await rm(root,{recursive:true,force:true});}
});
test('Drive downloads reject private destinations and malformed file ids before fetching', async () => {
  assert.equal(
    safeDriveDownload('https://drive.usercontent.google.com/download?id=abcdefghijk'),
    true,
  );
  for (const url of [
    'http://drive.google.com/a',
    'https://drive.google.com.evil.test/a',
    'https://u:p@drive.google.com/a',
    'https://127.0.0.1/a',
    'https://drive.google.com:4110/a',
  ])
    assert.equal(safeDriveDownload(url), false);
  let calls = 0;
  const redirect = async () => {
    calls++;
    return new Response(null, {
      status: 302,
      headers: { location: 'http://127.0.0.1:4110/private' },
    });
  };
  await assert.rejects(() => driveCreativeMedia('/unused', '../bad', redirect));
  assert.equal(calls, 0);
  await assert.rejects(() => driveCreativeMedia('/unused', 'abcdefghijk', redirect));
  assert.equal(calls, 1);
});
test('invalid media and oversized downloads do not reach ffmpeg', async () => {
  const root=await mkdtemp(join(tmpdir(),'tmx-invalid-media-'));
  try {
  await assert.rejects(()=>driveCreativeMedia('/unused','abcdefghijk',async()=>new Response('x',{status:206,headers:{'content-range':'bytes 10-20/21'}})),/parte do arquivo/);
  await assert.rejects(()=>driveCreativeMedia(root,'abcdefghijk',async()=>new Response('x',{status:206,headers:{'content-range':'bytes 0-19/20'}})),/incompleto/);
  await assert.rejects(() =>
    driveCreativeMedia(root, 'abcdefghijk', async () => new Response('<html>login</html>')),
  );
  await assert.rejects(() =>
    driveCreativeMedia(
      '/unused',
      'abcdefghijk',
      async () => new Response('x', { headers: { 'content-length': String(1025 * 1024 * 1024) } }),
    ),
  );
  assert.deepEqual(await readdir(root),[]);
  } finally {await rm(root,{recursive:true,force:true});}
});
