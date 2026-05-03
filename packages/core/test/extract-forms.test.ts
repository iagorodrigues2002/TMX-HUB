import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractForms } from '../src/extract/forms.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadFixture(name: string): Promise<string> {
  return readFile(join(__dirname, 'fixtures', name), 'utf8');
}

describe('extractForms', () => {
  it('extracts forms with id-based selectors when id is present', async () => {
    const html = await loadFixture('simple.html');
    const forms = extractForms(html, { baseUrl: 'https://example.com/page' });
    expect(forms).toHaveLength(2);
    const contact = forms.find((f) => f.selector === '#contact');
    expect(contact).toBeDefined();
    expect(contact?.method).toBe('POST');
    expect(contact?.originalAction).toBe('https://example.com/contact');
    expect(contact?.currentAction).toBe(contact?.originalAction);
    expect(contact?.mode).toBe('keep');
    expect(contact?.id.startsWith('frm_')).toBe(true);
    const fieldNames = contact?.fields.map((f) => f.name) ?? [];
    expect(fieldNames).toContain('email');
    expect(fieldNames).toContain('csrf');
    const csrf = contact?.fields.find((f) => f.name === 'csrf');
    expect(csrf?.hidden).toBe(true);
    const email = contact?.fields.find((f) => f.name === 'email');
    expect(email?.required).toBe(true);
  });

  it('falls back to action-based selector when no id is present', async () => {
    const html = await loadFixture('simple.html');
    const forms = extractForms(html, { baseUrl: 'https://example.com/page' });
    const newsletter = forms.find((f) => f.originalAction.endsWith('/newsletter'));
    expect(newsletter).toBeDefined();
    expect(newsletter?.selector).toContain('form[action="/newsletter"]');
  });

  it('handles nested forms with stable selectors', () => {
    const html = `
      <main>
        <section>
          <form action="/a" method="get">
            <input name="x" />
          </form>
          <form action="/b" method="post">
            <input name="y" />
          </form>
        </section>
      </main>
    `;
    const forms = extractForms(html, { baseUrl: 'https://example.com/' });
    expect(forms).toHaveLength(2);
    expect(forms[0]?.selector).toContain('form[action="/a"]');
    expect(forms[1]?.selector).toContain('form[action="/b"]');
    expect(forms[1]?.method).toBe('POST');
  });
});
