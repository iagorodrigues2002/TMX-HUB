import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import { ulid } from 'ulid';
import type { Form, FormField } from '../types.js';
import { resolveUrl } from '../assets/url-utils.js';
import { generateSelector } from './selectors.js';

export interface ExtractFormsOptions {
  baseUrl?: string;
}

export function extractForms(html: string, opts: ExtractFormsOptions = {}): Form[] {
  const $ = cheerio.load(html, { xml: false });
  const forms: Form[] = [];

  $('form').each((_, el) => {
    const node = $(el as Element);
    const rawAction = node.attr('action') ?? '';
    const action = rawAction
      ? opts.baseUrl
        ? resolveUrl(rawAction, opts.baseUrl)
        : rawAction
      : opts.baseUrl ?? '';
    const methodAttr = (node.attr('method') ?? 'GET').toUpperCase();
    const method: 'GET' | 'POST' = methodAttr === 'POST' ? 'POST' : 'GET';
    const selector = generateSelector($, el as Element);

    const fields: FormField[] = [];

    node.find('input, textarea, select').each((_i, fieldEl) => {
      const field = $(fieldEl as Element);
      const name = field.attr('name');
      if (!name) return;
      const tag = (fieldEl as Element).tagName.toLowerCase();
      let type: string;
      if (tag === 'textarea') type = 'textarea';
      else if (tag === 'select') type = 'select';
      else type = (field.attr('type') ?? 'text').toLowerCase();
      const value = tag === 'textarea' ? field.text() : field.attr('value');
      const hidden = type === 'hidden';
      const required = field.attr('required') !== undefined;
      fields.push({
        name,
        type,
        value: value ?? undefined,
        hidden,
        required,
      });
    });

    forms.push({
      id: `frm_${ulid()}`,
      selector,
      originalAction: action,
      currentAction: action,
      method,
      mode: 'keep',
      fields,
    });
  });

  return forms;
}
