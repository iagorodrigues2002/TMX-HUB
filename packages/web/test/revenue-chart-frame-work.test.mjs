import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import * as geometry from '../src/components/ui/revenue-geometry';
import { interpolateCount } from '../src/lib/motion-session';
import { formatCurrency, formatInt } from '../src/lib/number-format';

const ts = createRequire(import.meta.url)('typescript');
const code = ts.transpileModule(
  readFileSync(
    new URL('../src/components/overview/overview-dashboard-revenue-chart.tsx', import.meta.url),
    'utf8',
  ),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
).outputText;

function chartHarness() {
  const states = [];
  const refs = [];
  const effects = [];
  let stateCursor = 0;
  let refCursor = 0;
  let updates = 0;
  let cleanup = [];
  let nextFrame = 0;
  const frames = new Map();
  const flags = { reduced: false, hidden: false, disabled: false, pending: false };
  const events = { addEventListener() {}, removeEventListener() {} };
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    window: {
      matchMedia: () => ({
        ...events,
        get matches() {
          return flags.reduced;
        },
      }),
    },
    document: {
      ...events,
      get hidden() {
        return flags.hidden;
      },
      documentElement: {
        dataset: {
          get tmxMotion() {
            return flags.disabled ? 'off' : 'on';
          },
        },
      },
    },
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    requestAnimationFrame(callback) {
      frames.set(++nextFrame, callback);
      return nextFrame;
    },
    cancelAnimationFrame(id) {
      frames.delete(id);
    },
    require(name) {
      if (name === 'react')
        return {
          useId: () => 'chart-test',
          useRef(value) {
            const index = refCursor++;
            refs[index] ??= { current: value };
            return refs[index];
          },
          useState(value) {
            const index = stateCursor++;
            if (!(index in states)) states[index] = typeof value === 'function' ? value() : value;
            return [
              states[index],
              (next) => {
                states[index] = next;
                updates++;
              },
            ];
          },
          useEffect(callback) {
            effects.push(callback);
          },
        };
      if (name === 'react/jsx-runtime') return { jsx: () => null, jsxs: () => null };
      if (name.endsWith('kpi-cards')) return { formatCurrency, formatInt };
      if (name.endsWith('revenue-geometry')) return geometry;
      if (name.endsWith('data-pending')) return { useDataPending: () => flags.pending };
      if (name.endsWith('motion-session')) return { interpolateCount };
      if (name.endsWith('.module.css')) return { default: {} };
      throw Error(`Unexpected dependency: ${name}`);
    },
  });
  return {
    flags,
    render(values, props = {}) {
      for (const callback of cleanup) callback?.();
      effects.length = 0;
      stateCursor = refCursor = 0;
      exports.RevenueChart({
        title: 'Receita',
        description: 'Período',
        emptyMessage: 'Sem série',
        currency: 'BRL',
        points: values.map((value, hour) => ({
          key: `${hour}`,
          label: `${hour}h`,
          value,
          secondary: 1,
        })),
        animated: true,
        ...props,
      });
      cleanup = effects.map((callback) => callback());
    },
    tick(time) {
      const callbacks = [...frames.values()];
      frames.clear();
      for (const callback of callbacks) callback(time);
    },
    get queued() {
      return frames.size;
    },
    get updates() {
      return updates;
    },
    get plot() {
      return states[2];
    },
    dispose() {
      for (const callback of cleanup) callback?.();
    },
  };
}

test('an unchanged revenue chart schedules no frames or state updates on entry', () => {
  const chart = chartHarness();
  chart.render([100, 200, 50]);
  assert.equal(chart.queued, 0);
  assert.equal(chart.updates, 0);
  chart.render([100, 200, 50]);
  assert.equal(chart.queued, 0);
  assert.equal(chart.updates, 0);
  chart.dispose();
});

test('changed revenue animates from the current values, including interrupted changes', () => {
  const chart = chartHarness();
  chart.render([100, 200]);
  chart.render([500, 900]);
  assert.equal(chart.queued, 1);
  chart.tick(0);
  chart.tick(475);
  const halfway = [...chart.plot.values];
  const ceiling = chart.plot.ceiling;
  assert.ok(halfway[0] > 100 && halfway[0] < 500);
  chart.render([50, 100]);
  assert.equal(chart.queued, 1);
  chart.tick(500);
  assert.deepEqual([...chart.plot.values], halfway);
  assert.equal(chart.plot.ceiling, ceiling);
  chart.tick(1450);
  assert.deepEqual([...chart.plot.values], [50, 100]);
  assert.equal(chart.plot.ceiling, geometry.hourlyCeiling([50, 100]));
  assert.equal(chart.queued, 0);
  chart.dispose();
});

test('reduced motion, hidden tab, disabled effects and privacy finish without animation', () => {
  for (const mode of ['reduced', 'hidden', 'disabled', 'privateMode']) {
    const chart = chartHarness();
    chart.render([10]);
    chart.flags[mode] = true;
    chart.render([800], mode === 'privateMode' ? { privateMode: true } : {});
    assert.equal(chart.queued, 0);
    assert.deepEqual([...chart.plot.values], [800]);
    chart.dispose();
  }
});

test('changed values still animate when the chart ceiling stays the same', () => {
  const chart = chartHarness();
  chart.render([100, 200]);
  chart.render([150, 250]);
  assert.equal(chart.queued, 1);
  chart.tick(0);
  chart.tick(950);
  assert.deepEqual([...chart.plot.values], [150, 250]);
  assert.equal(chart.plot.ceiling, 400);
  assert.equal(chart.queued, 0);
  chart.dispose();
});

test('a changed number of points finishes without interpolating incompatible series', () => {
  const chart = chartHarness();
  chart.render([]);
  chart.render([150]);
  assert.equal(chart.queued, 0);
  assert.deepEqual([...chart.plot.values], [150]);
  chart.render([]);
  assert.equal(chart.queued, 0);
  assert.deepEqual([...chart.plot.values], []);
  chart.dispose();
});
