import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface InviteEmailData {
  inviterName: string;
  roleLabel: string;
  allowedTools?: string[];
  acceptUrl: string;
  expiresIn: string;
}

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character]!,
  );
const interpolate = (template: string, vars: Record<string, string>) =>
  template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');

export async function loadInviteTemplates(moduleUrl = import.meta.url) {
  const directory = dirname(fileURLToPath(moduleUrl));
  // Source modules live in src/lib; the bundled server lives directly in dist.
  for (const location of [join(directory, 'templates'), join(directory, '../templates')]) {
    try {
      const [html, text] = await Promise.all([
        readFile(join(location, 'invite-email.html'), 'utf8'),
        readFile(join(location, 'invite-email.txt'), 'utf8'),
      ]);
      return { html, text };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  throw new Error('Invite email templates are missing from the application build.');
}

export async function renderInviteEmail(data: InviteEmailData) {
  const templates = await loadInviteTemplates();
  const tools = data.allowedTools ?? [];
  const toolsText = tools.length ? tools.join(', ') : 'Acesso completo';
  const vars = {
    inviterName: data.inviterName,
    roleLabel: data.roleLabel,
    acceptUrl: data.acceptUrl,
    expiresIn: data.expiresIn,
    toolsText,
  };
  const htmlVars = Object.fromEntries(
    Object.entries(vars).map(([key, value]) => [key, escapeHtml(value)]),
  );
  htmlVars.toolsHtml = tools
    .map(
      (tool) =>
        `<span class="tools-chip" style="display:inline-block;margin:2px 4px 2px 0;padding:3px 10px;background-color:#07343a;color:#22d3ee;border:1px solid #155e75;border-radius:999px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:600;">${escapeHtml(tool)}</span>`,
    )
    .join('');
  const html = templates.html
    .replace(/\{\{#if allowedTools\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, block) =>
      tools.length ? block : '',
    )
    .replace(/\{\{\^if allowedTools\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, block) =>
      tools.length ? '' : block,
    );
  return {
    htmlContent: interpolate(html, htmlVars),
    textContent: interpolate(templates.text, vars),
  };
}
