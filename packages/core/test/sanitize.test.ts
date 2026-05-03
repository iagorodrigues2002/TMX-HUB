import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sanitize } from '../src/sanitize/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadFixture(name: string): Promise<string> {
  return readFile(join(__dirname, 'fixtures', name), 'utf8');
}

describe('sanitize', () => {
  it('removes scripts, noscripts, inline handlers, and javascript: hrefs', async () => {
    const html = await loadFixture('tracking-pixels.html');
    const result = sanitize(html);
    expect(result.html).not.toMatch(/<script\b/i);
    expect(result.html).not.toMatch(/<noscript\b/i);
    expect(result.html).not.toMatch(/onload=/i);
    expect(result.html).not.toMatch(/onclick=/i);
    expect(result.html).not.toMatch(/onmouseover=/i);
    expect(result.html).not.toMatch(/javascript:/i);
    expect(result.removed.scripts).toBeGreaterThanOrEqual(2);
    expect(result.removed.noscripts).toBeGreaterThanOrEqual(1);
    expect(result.removed.inlineHandlers).toBeGreaterThanOrEqual(2);
    expect(result.removed.javascriptUrls).toBeGreaterThanOrEqual(1);
  });

  it('strips tracking pixels and CSP meta tags', async () => {
    const html = await loadFixture('tracking-pixels.html');
    const result = sanitize(html);
    expect(result.html).not.toMatch(/facebook\.com\/tr/i);
    expect(result.html).not.toMatch(/hotjar\.com/i);
    expect(result.html).toMatch(/legit\.png/);
    expect(result.removed.trackingPixels).toBeGreaterThanOrEqual(2);
    expect(result.removed.cspMeta).toBeGreaterThanOrEqual(1);
  });

  it('removes srcdoc from iframes', async () => {
    const html = '<iframe srcdoc="<p>x</p>" src="about:blank"></iframe>';
    const result = sanitize(html);
    expect(result.html).not.toMatch(/srcdoc=/i);
    expect(result.removed.iframeSrcdoc).toBe(1);
  });
});
