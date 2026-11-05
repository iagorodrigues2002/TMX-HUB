import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const code = ts.transpileModule(
  readFileSync(new URL('../src/components/ui/kpi.tsx', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
).outputText;

for (const variant of ['default', 'compact', 'financial', 'status']) {
  test(`KPI ${variant} keeps frame updates in its value leaf and preserves accessibility`, () => {
    let calls = 0;
    let pending = false;
    let animated = 12;
    const exports = {};
    vm.runInNewContext(code, {
      exports,
      require(name) {
        if (name === 'react/jsx-runtime') return require(name);
        if (name.endsWith('/data-pending')) return { useDataPending: () => pending };
        if (name.endsWith('/use-count-up'))
          return {
            useCountUp: () => {
              calls++;
              return animated;
            },
          };
        if (name.endsWith('/utils')) return { cn: (...parts) => parts.filter(Boolean).join(' ') };
        throw Error(`Unexpected dependency: ${name}`);
      },
    });
    const props = {
      label: 'Vendas',
      value: '18',
      hint: 'Pedidos pagos',
      variant,
      countUp: { value: 18, format: String },
    };
    const card = exports.Kpi(props);
    assert.equal(calls, 0, 'the card must not subscribe to the per-frame count hook');
    const html = renderToStaticMarkup(card);
    assert.equal(calls, 1);
    assert.match(html, /class="sr-only">18<\/span>/);
    assert.match(html, /aria-hidden="true">12<\/span>/);
    assert.match(html, /Pedidos pagos/);
    pending = true;
    assert.doesNotMatch(renderToStaticMarkup(card), />18<|>12</);
    pending = false;
    animated = undefined;
    const masked = renderToStaticMarkup(
      exports.Kpi({ ...props, value: '••••', countUp: undefined }),
    );
    assert.match(masked, /••••/);
    assert.doesNotMatch(masked, />18<|>12</);
  });
}
