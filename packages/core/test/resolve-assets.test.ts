import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveAssets } from '../src/assets/resolve.js';
import { walkCss } from '../src/assets/css-walker.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadFixture(name: string): Promise<string> {
  return readFile(join(__dirname, 'fixtures', name), 'utf8');
}

describe('resolveAssets (no download)', () => {
  it('rewrites relative URLs in HTML attributes against the page URL', async () => {
    const html = await loadFixture('simple.html');
    const result = await resolveAssets(html, 'https://example.com/landing/', {
      download: false,
    });
    expect(result.html).toContain('https://example.com/static/styles.css');
    expect(result.html).toContain('https://example.com/images/hero.png');
    expect(result.assets.entries.length).toBeGreaterThan(0);
    const urls = result.assets.entries.map((e) => e.url);
    expect(urls).toContain('https://example.com/static/styles.css');
    expect(urls).toContain('https://example.com/images/hero.png');
  });

  it('rewrites url() inside <style> against the page URL', async () => {
    const html = await loadFixture('relative-css.html');
    const result = await resolveAssets(html, 'https://example.com/landing/', {
      download: false,
    });
    expect(result.html).toContain('https://example.com/abs.png');
    expect(result.html).toContain('https://cdn.example.com/x.png');
    expect(result.html).toContain('https://example.com/images/dot.png');
    expect(result.html).not.toContain('"data:image/png;base64,abc"'); // data: URLs are skipped
    expect(result.html).toContain('data:image/png;base64,abc');
  });

  it('rewrites @import url() in <style>', async () => {
    const html = await loadFixture('relative-css.html');
    const result = await resolveAssets(html, 'https://example.com/landing/', {
      download: false,
    });
    expect(result.html).toContain('https://example.com/assets/css/typography.css');
  });

  it('rewrites url() in inline style attributes', async () => {
    const html = '<p style="background: url(\'/inline.png\')">Hi</p>';
    const result = await resolveAssets(html, 'https://example.com/landing/', {
      download: false,
    });
    expect(result.html).toContain('https://example.com/inline.png');
  });

  it('CSS walker resolves URLs against the CSS file URL, not the page URL', () => {
    const css = '.a { background: url("./photo.png"); }';
    const result = walkCss(css, {
      cssBaseUrl: 'https://cdn.example.com/css/style.css',
      visit: (_raw, abs) => abs,
    });
    expect(result.css).toContain('https://cdn.example.com/css/photo.png');
    expect(result.css).not.toContain('example.com/photo.png');
  });

  it('protocol-relative URLs get the page scheme', async () => {
    const html = '<style>.a { background: url("//cdn.example.com/x.png"); }</style>';
    const result = await resolveAssets(html, 'https://example.com/landing/', {
      download: false,
    });
    expect(result.html).toContain('https://cdn.example.com/x.png');
  });

  it('skips data:, blob:, and #fragment URLs', () => {
    const css = `
      .a { background: url("data:image/png;base64,xxx"); }
      .b { background: url("blob:nope"); }
      .c { background: url("#frag"); }
    `;
    const visited: string[] = [];
    walkCss(css, {
      cssBaseUrl: 'https://example.com/styles.css',
      visit: (_raw, abs) => {
        visited.push(abs);
        return abs;
      },
    });
    expect(visited).toEqual([]);
  });
});
