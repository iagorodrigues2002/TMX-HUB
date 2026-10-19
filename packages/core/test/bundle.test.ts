import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import * as cheerio from 'cheerio';
import { describe, expect, it, vi } from 'vitest';
import { bundle } from '../src/bundle/index.js';
import { buildZip } from '../src/bundle/zip.js';
import type { CloneState } from '../src/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadFixture(name: string): Promise<string> {
  return readFile(join(__dirname, 'fixtures', name), 'utf8');
}

function makeState(html: string): CloneState {
  return {
    jobId: '01HW3K9P2N7XQK4D6V5RYMC1ZB',
    sourceUrl: 'https://example.com/landing',
    finalUrl: 'https://example.com/landing',
    status: 'ready',
    html,
    assets: { entries: [], byUrl: {} },
    forms: [
      {
        id: 'frm_01HW3K9P2N7XQK4D6V5RYMC1ZA',
        selector: '#contact',
        originalAction: '/contact',
        currentAction: 'https://lead.mysite.com/in',
        method: 'POST',
        mode: 'replace',
        fields: [],
      },
    ],
    links: [
      {
        id: 'lnk_01HW3K9P2N7XQK4D6V5RYMC1ZA',
        selector: 'a.btn-primary',
        originalHref: '/signup',
        currentHref: 'https://mysite.com/signup',
        text: 'Sign Up',
        isExternal: false,
        isCta: true,
      },
    ],
    createdAt: '2026-05-02T14:22:01Z',
    updatedAt: '2026-05-02T14:22:18Z',
  };
}

describe('bundle (single HTML)', () => {
  it('produces parseable HTML and applies form/link edits', async () => {
    const html = await loadFixture('simple.html');
    const state = makeState(html);
    const out = await bundle(state, {
      format: 'html',
      inlineAssets: false,
      applyEdits: true,
    });
    const text = out.toString('utf8');
    expect(text.length).toBeGreaterThan(0);
    const $ = cheerio.load(text);
    expect($('#contact').attr('action')).toBe('https://lead.mysite.com/in');
    expect($('a.btn-primary').attr('href')).toBe('https://mysite.com/signup');
    expect($('h1').text()).toBe('Welcome');
  });

  it('skips edits when applyEdits=false', async () => {
    const html = await loadFixture('simple.html');
    const state = makeState(html);
    const out = await bundle(state, {
      format: 'html',
      inlineAssets: false,
      applyEdits: false,
    });
    const $ = cheerio.load(out.toString('utf8'));
    expect($('#contact').attr('action')).toBe('/contact');
    expect($('a.btn-primary').attr('href')).toBe('/signup');
  });

  it('disable mode neutralizes form submission', async () => {
    const html = await loadFixture('simple.html');
    const state = makeState(html);
    const form = state.forms[0];
    if (!form) throw new Error('fixture missing form');
    form.mode = 'disable';
    const out = await bundle(state, {
      format: 'html',
      inlineAssets: false,
      applyEdits: true,
    });
    const $ = cheerio.load(out.toString('utf8'));
    expect($('#contact').attr('onsubmit')).toBe('return false;');
  });
});

describe('bundle (zip)', () => {
  it('rewrites every original URL when redirected assets share a final URL', async () => {
    const state = makeState(
      '<img src="/old.png"><img src="/alias.png"><img src="https://cdn.example.com/image.png">',
    );
    state.assets.entries = ['/old.png', '/alias.png'].map((path, index) => ({
      id: `asset-${index}`,
      url: 'https://cdn.example.com/image.png',
      originalUrl: `https://example.com${path}`,
      kind: 'image',
      mime: 'image/png',
      size: 5,
      hash: 'fixture',
      storageKey: 'fixture.png',
    }));
    const fetchUrl = vi.fn(async () => ({ data: Buffer.from('image'), mime: 'image/png' }));
    const out = await buildZip(state, { applyEdits: false, fetchUrl });
    expect(out.readUInt32LE(out.length - 22)).toBe(0x06054b50);
    expect(out.readUInt16LE(out.length - 12)).toBe(2);
    const nameLength = out.readUInt16LE(26);
    expect(out.subarray(30, 30 + nameLength).toString()).toBe('index.html');
    const htmlOffset = 30 + nameLength + out.readUInt16LE(28);
    const $ = cheerio.load(inflateRawSync(out.subarray(htmlOffset)).toString());
    expect(
      $('img')
        .map((_, el) => $(el).attr('src'))
        .get(),
    ).toEqual(['assets/fixture.png', 'assets/fixture.png', 'assets/fixture.png']);
    expect(fetchUrl).toHaveBeenCalledOnce();
    expect(fetchUrl).toHaveBeenCalledWith('https://cdn.example.com/image.png');
  });

  it('produces a non-empty buffer with the ZIP magic bytes', async () => {
    const html = await loadFixture('simple.html');
    const state = makeState(html);
    const out = await bundle(state, { format: 'zip', applyEdits: true });
    expect(out.length).toBeGreaterThan(20);
    // PK\x03\x04 ZIP local file header
    expect(out[0]).toBe(0x50);
    expect(out[1]).toBe(0x4b);
    expect(out[2]).toBe(0x03);
    expect(out[3]).toBe(0x04);
  });
});
