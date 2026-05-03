import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractLinks } from '../src/extract/links.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadFixture(name: string): Promise<string> {
  return readFile(join(__dirname, 'fixtures', name), 'utf8');
}

describe('extractLinks', () => {
  it('extracts anchors and buttons with prefixed ULID ids', async () => {
    const html = await loadFixture('simple.html');
    const links = extractLinks(html, { baseUrl: 'https://example.com/landing' });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.id.startsWith('lnk_')).toBe(true);
    }
  });

  it('marks external links correctly', async () => {
    const html = await loadFixture('simple.html');
    const links = extractLinks(html, { baseUrl: 'https://example.com/landing' });
    const external = links.find((l) => l.originalHref.includes('other.example.com'));
    expect(external?.isExternal).toBe(true);
    const internal = links.find((l) => l.originalHref.endsWith('/about'));
    expect(internal?.isExternal).toBe(false);
  });

  it('flags CTAs from button tags and class heuristics', async () => {
    const html = await loadFixture('simple.html');
    const links = extractLinks(html, { baseUrl: 'https://example.com/landing' });
    const signup = links.find((l) => l.originalHref.endsWith('/signup'));
    expect(signup?.isCta).toBe(true);
    const button = links.find((l) => l.text === 'Get Started');
    expect(button?.isCta).toBe(true);
    const plain = links.find((l) => l.text === 'About');
    expect(plain?.isCta).toBe(false);
  });

  it('resolves relative hrefs to absolute against the base URL', async () => {
    const html = await loadFixture('simple.html');
    const links = extractLinks(html, { baseUrl: 'https://example.com/landing' });
    const about = links.find((l) => l.text === 'About');
    expect(about?.originalHref).toBe('https://example.com/about');
    expect(about?.currentHref).toBe(about?.originalHref);
  });
});
