import assert from 'node:assert/strict';
import test from 'node:test';
import { toast } from 'sonner';
import { copyText } from '../src/lib/clipboard';

for (const outcome of ['success', 'denied', 'unavailable'] as const) {
  test(`clipboard ${outcome} settles without false success or an unhandled rejection`, async (t) => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    t.after(() => {
      if (original) Object.defineProperty(globalThis, 'navigator', original);
      else Reflect.deleteProperty(globalThis, 'navigator');
    });
    const writes: string[] = [];
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value:
        outcome === 'unavailable'
          ? {}
          : {
              clipboard: {
                writeText: async (value: string) => {
                  if (outcome === 'denied') throw new Error('Synthetic clipboard denial');
                  writes.push(value);
                },
              },
            },
    });
    const success = t.mock.method(toast, 'success', () => 0);
    const error = t.mock.method(toast, 'error', () => 0);
    assert.equal(await copyText('synthetic text', 'Copiado.'), outcome === 'success');
    assert.deepEqual(writes, outcome === 'success' ? ['synthetic text'] : []);
    assert.equal(success.mock.calls.length, outcome === 'success' ? 1 : 0);
    assert.equal(error.mock.calls.length, outcome === 'success' ? 0 : 1);
    if (outcome !== 'success') {
      assert.match(String(error.mock.calls[0]?.arguments[0]), /copie manualmente/);
    }
  });
}
