import { describe, it, expect } from 'vitest';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { loadInviteTemplates, renderInviteEmail } from '../src/lib/invite-email.js';

const data = { inviterName: 'Iago', roleLabel: 'Membro', acceptUrl: 'https://theminex.com/register?invite=test-only', expiresIn: '7 dias' };
describe('invite HTML and production assets', () => {
  it('loads the actual HTML and text templates in source', async () => {
    const templates = await loadInviteTemplates();
    expect(templates.html).toContain('{{acceptUrl}}');
    expect(templates.text).toContain('{{acceptUrl}}');
  });
  it('renders full-access invitations with no unresolved conditional blocks', async () => {
    const result = await renderInviteEmail(data);
    expect(result.htmlContent).toContain(data.acceptUrl);
    expect(result.textContent).toContain('Acesso completo');
    expect(result.htmlContent).not.toContain('{{');
  });
  it('renders restricted tools without the full-access block', async () => {
    const result = await renderInviteEmail({ ...data, allowedTools: ['tracking'] });
    expect(result.htmlContent).toContain('tracking');
    expect(result.textContent).toContain('Ferramentas: tracking');
    expect(result.htmlContent).not.toContain('{{');
    expect(result.htmlContent).not.toContain('Acesso completo');
  });
  it('escapes dynamic HTML without changing plain text', async () => {
    const result = await renderInviteEmail({ ...data, inviterName: '<img src=x>', allowedTools: ['<script>'], acceptUrl: data.acceptUrl + '&a="bad"' });
    expect(result.htmlContent).toContain('&lt;img src=x&gt;');
    expect(result.htmlContent).toContain('&lt;script&gt;');
    expect(result.htmlContent).toContain('&amp;a=&quot;bad&quot;');
    expect(result.htmlContent).not.toContain('<script>');
    expect(result.textContent).toContain('<img src=x>');
  });
  it('loads assets beside a flattened production bundle', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tmx-invite-assets-'));
    try {
      await cp(new URL('../src/templates', import.meta.url), join(directory, 'templates'), { recursive: true });
      const templates = await loadInviteTemplates(pathToFileURL(join(directory, 'server.js')).href);
      expect(templates.html).toContain('{{acceptUrl}}');
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
