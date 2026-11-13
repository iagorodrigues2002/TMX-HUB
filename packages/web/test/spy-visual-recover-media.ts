// Local recovery of public CDN assets through the existing server network; no server files or application data are changed.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, access, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { spyVisualFrames } from '../src/lib/spy-visual-frames';
import { safeAdMedia } from '../src/lib/spy-ad-preview';
import { analyzeSpyCreatives } from '../src/lib/spy-creative-analysis';
const exec = promisify(execFile);
const root = join(
  homedir(),
  '.codex/local-data/tmx/ai-preview/spy-visual-source/69706e9a-95ad-493e-b4ab-4a6de7541adc',
);
const source = JSON.parse(await readFile(join(root, 'source.json'), 'utf8'));
const batch = JSON.parse(await readFile(join(root, 'batch-results.json'), 'utf8'));
const recovery = JSON.parse(await readFile(join(root, 'recovered-references.json'), 'utf8'));
const analysis = analyzeSpyCreatives(source.job.snapshots, source.job.snapshots.at(-1));
const ids = [
  ...new Set([
    ...(Object.values(batch.results) as { status: number; id: string; reference: string }[])
      .filter((r) => r.status !== 200)
      .flatMap((r) => [r.id, r.reference]),
    ...(process.argv.includes('--references')
      ? Object.entries(recovery.references).flatMap(([id, r]: [string, any]) => [id, r.id])
      : []),
    ...(process.argv.includes('--remaining')
      ? [...analysis.results]
          .filter(([id, a]) => a.status === 'unverified' && a.previous && !batch.results[id])
          .flatMap(([id, a]) => [id, a.previous!.id])
      : []),
  ]),
];
const results = [];
for (const id of ids) {
  const ad = source.job.snapshots.flatMap((s: any) => s.ads).find((a: any) => a.id === id);
  const asset = ad?.creativeAssets?.[0];
  if (!asset || ad.creativeAssets.length !== 1 || !safeAdMedia(asset.url)) continue;
  const key = createHash('sha256')
    .update('frames-v1:' + asset.kind + ':' + (asset.sha256 ?? asset.url))
    .digest('hex');
  try {
    await access(join(root, 'frames', key + '.json'));
    results.push({ id, cached: true });
    continue;
  } catch {}
  const script = `(async()=>{const r=await fetch(${JSON.stringify(asset.url)},{redirect:'error',signal:AbortSignal.timeout(45000)});if(!r.ok)throw Error('CDN '+r.status);if(Number(r.headers.get('content-length')||0)>33554432)throw Error('too large');let size=0;const chunks=[];for await(const chunk of r.body){size+=chunk.length;if(size>33554432)throw Error('too large');chunks.push(Buffer.from(chunk))}console.log('PUBLIC_MEDIA:'+Buffer.concat(chunks).toString('base64'));})().catch(e=>{console.log('MEDIA_FAILED:'+e.message);process.exitCode=1});`;
  try {
    const { stdout } = await exec(
      '/opt/homebrew/bin/railway',
      [
        'ssh',
        '--project',
        '3704cd93-6011-4e5f-be52-f229b499b018',
        '--environment',
        'production',
        '--service',
        '@page-cloner/web',
        '--',
        'node',
        '-e',
        script,
      ],
      { timeout: 75000, maxBuffer: 50000000 },
    );
    const line = stdout.split('\n').find((l) => l.startsWith('PUBLIC_MEDIA:'));
    if (!line) throw Error('No media');
    const bytes = Buffer.from(line.slice(13), 'base64');
    const frames = await spyVisualFrames(
      join(root, 'frames'),
      ad,
      (async () =>
        new Response(bytes, { headers: { 'content-type': asset.kind + '/mp4' } })) as typeof fetch,
    );
    results.push({ id, recovered: true, bytes: bytes.length, frames: frames.length });
  } catch {
    results.push({
      id,
      recovered: false,
      reason: 'A mídia também não pôde ser recuperada pela rede do servidor.',
    });
  }
  console.log(JSON.stringify(results.at(-1)));
  await writeFile(
    join(root, 'media-recovery.json'),
    JSON.stringify({ at: new Date().toISOString(), results }),
    { mode: 0o600 },
  );
}
