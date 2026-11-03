import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = (name: string) =>
  readFileSync(new URL(`../src/components/tasks/${name}`, import.meta.url), 'utf8');

test('task views keep their company scope and use the shell motion coordinator', () => {
  const page = source('task-management-page.tsx');
  assert.match(page, /aria-label="Empresa da gestão"/);
  assert.match(page, /taskManagementHref\(searchParams.toString\(\), value\)/);
  assert.match(page, /hidden=\{tab !== 'tasks'\}/);
  assert.equal((page.match(/companyId=\{companyId \|\| undefined\}/g) ?? []).length, 2);
  for (const file of ['task-dashboard.tsx', 'calls-dashboard.tsx']) {
    assert.match(source(file), /data-motion-panel/);
  }
});

test('task feedback has reduced motion and effects-off fallbacks without replaying list entrances', () => {
  const css = source('task-dashboard.module.css');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /html\[data-tmx-motion="off"\] \.details/);
  assert.match(css, /\.taskTrigger:focus-visible/);
  assert.match(css, /min-height: 44px/);
  assert.doesNotMatch(css.match(/\.task \{[^}]+\}/)?.[0] ?? '', /animation:/);
  assert.doesNotMatch(css.match(/\.dashboard \{[^}]+\}/)?.[0] ?? '', /animation:/);
  assert.doesNotMatch(css, /hsl\(var\(--/);
});
