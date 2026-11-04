import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const ts = createRequire(import.meta.url)('typescript');
const compile = (file) =>
  ts.transpileModule(
    readFileSync(new URL(`../src/lib/api-client/${file}`, import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText;

test('dashboard reads forward cancellation without changing periods or sales view', async () => {
  const calls = [];
  const load = (file) => {
    const exports = {};
    vm.runInNewContext(compile(file), {
      exports,
      URLSearchParams,
      require(name) {
        if (name === './request.js')
          return {
            request: async (path, options) => {
              calls.push({ path, options });
              return {};
            },
          };
        if (name === './response-types.js')
          return { trackingPeriodParams: (period) => new URLSearchParams(period) };
        if (name.endsWith('-wire.js')) return new Proxy({}, { get: () => (value) => value });
        throw new Error(`Unexpected dependency ${name}`);
      },
    });
    return exports.endpoints;
  };
  const dashboard = load('endpoints-dashboard.ts');
  const offers = load('endpoints-offers.ts');
  const finance = load('endpoints-tracking-finance.ts');
  const signal = new AbortController().signal;
  const period = { from: '2026-11-01', to: '2026-11-03' };
  await dashboard.getOfferSnapshots('offer', period, signal);
  await dashboard.getDashboardSummary(period, signal);
  await offers.getOfferIntradayRange('offer', period.from, period.to, signal);
  await offers.getOfferIntraday('offer', period.from, signal);
  await finance.getTrackingSummary('offer', period, 'natural', signal);
  await finance.getTrackingOverview(period.from, period.to, 'natural', signal);
  assert.equal(calls.length, 6);
  for (const call of calls) assert.equal(call.options.signal, signal);
  for (const call of calls.filter((call) => call.path.includes('tracking/'))) {
    const params = new URL(call.path, 'http://localhost').searchParams;
    assert.equal(params.get('from'), period.from);
    assert.equal(params.get('to'), period.to);
    assert.equal(params.get('sales_view'), 'natural');
  }
});

test('intentional abort stays an abort; genuine connection failures retain actionable errors', async () => {
  class ApiError extends Error {
    constructor(message, status) {
      super(message);
      this.status = status;
    }
  }
  const warnings = [];
  const exports = {};
  vm.runInNewContext(compile('request.ts'), {
    exports,
    URL,
    document: { cookie: '' },
    navigator: { onLine: true },
    window: {
      localStorage: { getItem: () => null },
      sessionStorage: { getItem: () => null },
      location: { origin: 'http://localhost', protocol: 'http:' },
    },
    console: { warn: (...args) => warnings.push(args) },
    fetch: async (_url, options) => {
      if (options.signal?.aborted) throw options.signal.reason;
      if (options.signal)
        return new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => reject(options.signal.reason), {
            once: true,
          });
        });
      throw new TypeError('Failed to fetch');
    },
    require(name) {
      if (name === '../env.js') return { env: { NEXT_PUBLIC_API_URL: 'http://localhost' } };
      if (name === '../query-client.js') return { ApiError };
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    exports.request('/read', { signal: controller.signal }),
    (error) => error === controller.signal.reason,
  );
  assert.equal(warnings.length, 0);
  const pending = new AbortController();
  const request = exports.request('/read', { signal: pending.signal });
  pending.abort();
  await assert.rejects(request, (error) => error === pending.signal.reason);
  assert.equal(warnings.length, 0);
  await assert.rejects(
    exports.request('/read'),
    (error) =>
      error instanceof ApiError &&
      error.status === 0 &&
      /Falha ao chamar a API/.test(error.message),
  );
  assert.equal(warnings.length, 1);
});
