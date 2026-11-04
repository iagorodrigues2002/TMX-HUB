import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { migrateSource, uiFiles } from '../../../scripts/audit-design-system.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const app = path.join(root, 'packages/web/src/app');
const manifest = JSON.parse(
  readFileSync(path.join(root, 'docs/design-system-routes.json'), 'utf8'),
);
function pages(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((item) =>
      item.isDirectory()
        ? pages(path.join(directory, item.name))
        : item.name === 'page.tsx'
          ? [path.relative(root, path.join(directory, item.name))]
          : [],
    )
    .sort();
}

test('every application route is explicitly covered by the design system inventory', () => {
  assert.deepEqual(manifest.map((entry) => entry.source).sort(), pages(app));
  for (const entry of manifest) {
    const source = readFileSync(path.join(root, entry.source), 'utf8');
    if (entry.frame === 'redirect')
      assert.ok(source.includes(`redirect('${entry.target}')`), entry.route);
    else if (entry.frame === 'hub')
      assert.match(source, /<(?:HubShell|EditorShell)\b/, entry.route);
    else if (entry.frame === 'public') assert.match(source, /<PublicSurface\b/, entry.route);
    else assert.match(source, /reference|Reference/, entry.route);
  }
});

test('no application UI falls back to legacy neutral or signal utility colors', () => {
  const remaining = uiFiles()
    .filter((filename) => {
      const source = readFileSync(filename, 'utf8');
      return migrateSource(source, filename) !== source;
    })
    .map((filename) => path.relative(root, filename));
  assert.deepEqual(remaining, []);
});

test('standalone error, not found and editor loading states share the public material', () => {
  for (const filename of ['error.tsx', 'not-found.tsx', 'tools/cloner/jobs/[id]/loading.tsx'])
    assert.match(readFileSync(path.join(app, filename), 'utf8'), /PublicSurface/);
});

test('the root template coordinates motion for every route, including public and focused pages', () => {
  const template = readFileSync(path.join(app, 'template.tsx'), 'utf8');
  const shell = readFileSync(
    path.join(root, 'packages/web/src/components/hub/hub-shell.tsx'),
    'utf8',
  );
  assert.match(template, /<RouteMotion>\{children\}<\/RouteMotion>/);
  const motion = readFileSync(
    path.join(root, 'packages/web/src/components/hub/route-motion.tsx'),
    'utf8',
  );
  assert.match(motion, /ref=\{content\}/);
  assert.doesNotMatch(shell, /<RouteMotion/);
  assert.doesNotMatch(template, /display:\s*['"]contents/);
  for (const filename of [...uiFiles(), path.join(root, 'packages/web/src/lib/auth-context.tsx')]) {
    assert.doesNotMatch(
      readFileSync(filename, 'utf8'),
      /import\s*\{[^}]*\buseRouter\b[^}]*\}\s*from ['"]next\/navigation['"]/,
      filename,
    );
  }
});
