import type { ChallengeKind } from '../types.js';

const TITLE_SIGNATURES: Array<[RegExp, ChallengeKind]> = [
  [/just a moment/i, 'cloudflare'],
  [/checking your browser/i, 'cloudflare'],
  [/attention required/i, 'cloudflare'],
  [/access denied/i, 'cloudflare'],
  [/captcha/i, 'captcha'],
  [/are you a human/i, 'captcha'],
];

const SELECTOR_SIGNATURES: Array<[string, ChallengeKind]> = [
  ['#cf-challenge-running', 'cloudflare'],
  ['#challenge-form', 'cloudflare'],
  ['.cf-browser-verification', 'cloudflare'],
  ['#captcha', 'captcha'],
  ['iframe[src*="recaptcha"]', 'captcha'],
  ['iframe[src*="hcaptcha"]', 'captcha'],
  ['div[id^="px-captcha"]', 'captcha'],
];

export interface ChallengeInput {
  title: string;
  html: string;
  statusCode: number;
}

export function detectChallenge(input: ChallengeInput): ChallengeKind | null {
  if (input.statusCode === 429) return 'rate_limited';
  if (input.statusCode === 403) {
    for (const [re, kind] of TITLE_SIGNATURES) {
      if (re.test(input.title)) return kind;
    }
    return 'unknown';
  }
  for (const [re, kind] of TITLE_SIGNATURES) {
    if (re.test(input.title)) return kind;
  }
  for (const [sel, kind] of SELECTOR_SIGNATURES) {
    if (htmlContainsSelectorHint(input.html, sel)) return kind;
  }
  return null;
}

function htmlContainsSelectorHint(html: string, selector: string): boolean {
  const idMatch = /^#([\w-]+)/.exec(selector);
  if (idMatch) return new RegExp(`id=["']?${idMatch[1]}`, 'i').test(html);
  const classMatch = /^\.([\w-]+)/.exec(selector);
  if (classMatch) return new RegExp(`class=["'][^"']*\\b${classMatch[1]}\\b`, 'i').test(html);
  const iframeMatch = /iframe\[src\*="([^"]+)"\]/.exec(selector);
  if (iframeMatch) return new RegExp(`<iframe[^>]+src=["'][^"']*${iframeMatch[1]}`, 'i').test(html);
  return false;
}
