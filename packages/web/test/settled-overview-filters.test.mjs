import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const ts = createRequire(import.meta.url)('typescript');
function harness() {
  let state;
  let initialized = false;
  let dependencies;
  let cleanup;
  let sequence = 0;
  let updates = 0;
  const jobs = new Map();
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(
      readFileSync(
        new URL('../src/components/overview/use-settled-overview-filters.ts', import.meta.url),
        'utf8',
      ),
      { compilerOptions: { module: ts.ModuleKind.CommonJS } },
    ).outputText,
    {
      exports,
      setTimeout(callback, delay) {
        const id = ++sequence;
        jobs.set(id, { callback, delay });
        return id;
      },
      clearTimeout(id) {
        jobs.delete(id);
      },
      require(name) {
        assert.equal(name, 'react');
        return {
          useState(initial) {
            if (!initialized) {
              state = initial();
              initialized = true;
            }
            return [
              state,
              (next) => {
                state = next;
                updates++;
              },
            ];
          },
          useEffect(effect, next) {
            if (dependencies?.every((value, index) => Object.is(value, next[index]))) return;
            cleanup?.();
            dependencies = next;
            cleanup = effect();
          },
        };
      },
    },
  );
  return {
    jobs,
    render(from, view = 'general') {
      return exports.useSettledOverviewFilters({ from, to: from }, view);
    },
    flush() {
      for (const [id, job] of jobs) {
        jobs.delete(id);
        job.callback();
      }
    },
    unmount() {
      cleanup?.();
    },
    updates: () => updates,
  };
}

test('rapid period and view changes commit one coherent selection after 160ms', () => {
  const h = harness();
  assert.equal(h.render('2026-11-01').pending, false);
  const first = h.render('2026-11-02');
  assert.equal(first.pending, true);
  assert.equal(first.period.from, '2026-11-01');
  const second = h.render('2026-11-03', 'natural');
  assert.equal(second.period.from, '2026-11-01');
  assert.equal(second.salesView, 'general');
  assert.equal(h.jobs.size, 1);
  assert.equal([...h.jobs.values()][0].delay, 160);
  h.flush();
  const final = h.render('2026-11-03', 'natural');
  assert.equal(final.pending, false);
  assert.equal(final.period.from, '2026-11-03');
  assert.equal(final.period.to, '2026-11-03');
  assert.equal(final.salesView, 'natural');
  assert.equal(h.updates(), 1);
});

test('returning to the current selection cancels an intermediate request selection', () => {
  const h = harness();
  h.render('2026-11-01');
  h.render('2026-11-02', 'natural');
  assert.equal(h.render('2026-11-01').pending, false);
  assert.equal(h.jobs.size, 0);
  h.flush();
  assert.equal(h.updates(), 0);
});

test('unmount discards a scheduled filter update and pending filters protect visible fields', () => {
  const h = harness();
  h.render('2026-11-01');
  h.render('2026-11-02');
  h.unmount();
  h.flush();
  assert.equal(h.updates(), 0);
  const source = readFileSync(
    new URL('../src/components/overview/overview-dashboard.tsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /const isLoading =\s*filtersPending/);
  assert.match(source, /const isFetching =\s*filtersPending/);
  assert.match(source, /value=\{period\}/);
  assert.match(source, /period=\{queryPeriod\}/);
  assert.match(source, /salesView=\{queryView\}/);
});
