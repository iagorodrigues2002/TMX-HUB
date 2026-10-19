import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { disposeBrowser, getBrowser, prepareMediaProcess } from '../dist/index.js';

assert.equal(process.env.TMX_MEDIA_PROCESS_FIXTURE, 'network-none-synthetic');
assert.match(await readFile('/proc/self/status', 'utf8'), /CapEff:\s+0+\n/);
const run = promisify(execFile);

test('Chromium renders without extra capabilities and blocks private HTTP via proxy', async () => {
  let hits = 0;
  const server = createServer((_req, res) => {
    hits++;
    res.end('private');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  process.env.TMX_CHROMIUM_EXECUTABLE = '/usr/bin/chromium';
  try {
    const browser = await getBrowser();
    const page = await browser.newPage();
    await page.setContent('<h1>Synthetic fixture</h1>');
    assert.equal(await page.locator('h1').textContent(), 'Synthetic fixture');
    const response = await page.goto(`http://127.0.0.1:${server.address().port}`, {
      timeout: 10000,
    });
    assert.equal(response.status(), 403);
    assert.equal(hits, 0);
  } finally {
    await disposeBrowser();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('FFmpeg processes temporary media without namespaces and retains caller output', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'media-integration-'));
  let prepared;
  try {
    const input = join(dir, 'input.wav');
    const output = join(dir, 'output.wav');
    await run('/usr/bin/ffmpeg', [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'anullsrc',
      '-t',
      '0.1',
      input,
    ]);
    prepared = await prepareMediaProcess({
      executable: 'ffmpeg',
      mode: 'local',
      inputFiles: [input],
      outputFiles: [output],
    });
    assert.equal(prepared.env.JWT_SECRET, undefined);
    await run(
      prepared.executablePath,
      ['-v', 'error', '-y', '-protocol_whitelist', 'file,pipe', '-i', input, '-c', 'copy', output],
      { env: prepared.env },
    );
    await prepared.close();
    assert.ok((await stat(output)).size > 0);
  } finally {
    await prepared?.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('FFmpeg public proxy rejects private destinations without contacting them', async () => {
  let hits = 0;
  const server = createServer((_req, res) => {
    hits++;
    res.end('private');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const prepared = await prepareMediaProcess({ executable: 'ffmpeg', mode: 'public' });
  try {
    await assert.rejects(
      run(
        prepared.executablePath,
        [
          '-v',
          'error',
          '-http_proxy',
          prepared.proxyUrl,
          '-protocol_whitelist',
          'http,https,tcp,tls,httpproxy',
          '-i',
          `http://127.0.0.1:${server.address().port}/private`,
          '-f',
          'null',
          '-',
        ],
        { env: prepared.env, timeout: 10000 },
      ),
      /403 Forbidden/,
    );
    assert.equal(hits, 0);
  } finally {
    await prepared.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
