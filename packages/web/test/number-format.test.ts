import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import { formatCurrency, formatInt } from '../src/lib/number-format';

test('cached KPI formatters preserve currency, rounding and missing-value presentation', () => {
  for (const currency of ['BRL', 'USD', 'EUR', 'GBP', 'MXN', 'JPY', 'KWD']) {
    for (const value of [0, -0, 0.005, -0.005, -100.5, 3130.34, 9999999.999]) {
      assert.equal(
        formatCurrency(value, currency),
        value.toLocaleString('pt-BR', { style: 'currency', currency, maximumFractionDigits: 2 }),
      );
      assert.equal(formatInt(value), Math.round(value).toLocaleString('pt-BR'));
    }
  }
  for (const value of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(formatCurrency(value), '—');
    assert.equal(formatInt(value), '—');
  }
  assert.throws(() => formatCurrency(1, 'invalid'), RangeError);
});

test('animation frames reuse formatters and the currency cache remains bounded', () => {
  const ts = createRequire(import.meta.url)('typescript');
  const code = ts.transpileModule(
    readFileSync(new URL('../src/lib/number-format.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText;
  let constructions = 0;
  const exports: { formatCurrency?: typeof formatCurrency; formatInt?: typeof formatInt } = {};
  vm.runInNewContext(code, {
    exports,
    Intl: {
      NumberFormat: class extends Intl.NumberFormat {
        constructor(...args: ConstructorParameters<typeof Intl.NumberFormat>) {
          super(...args);
          constructions++;
        }
      },
    },
  });
  for (let frame = 0; frame < 200; frame++) {
    for (const currency of ['BRL', 'USD', 'EUR']) exports.formatCurrency?.(frame / 100, currency);
    exports.formatInt?.(frame);
  }
  assert.equal(constructions, 4);
  for (let i = 0; i < 26; i++) exports.formatCurrency?.(1, `A${String.fromCharCode(65 + i)}A`);
  // Exceed the cache capacity with valid three-letter codes.
  for (let i = 0; i < 10; i++) exports.formatCurrency?.(1, `B${String.fromCharCode(65 + i)}A`);
  const before = constructions;
  exports.formatCurrency?.(1, 'BRL');
  assert.equal(constructions, before + 1);
});
