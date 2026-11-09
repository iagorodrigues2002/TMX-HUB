import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const fake = vi.hoisted(() => ({
  handler: undefined as unknown as (req: IncomingMessage, res: ServerResponse) => void,
}));
vi.mock('node:fs/promises', () => ({ mkdir: vi.fn(), rename: vi.fn(), writeFile: vi.fn() }));
vi.mock('node:http', () => ({
  createServer: (handler: typeof fake.handler) => {
    fake.handler = handler;
    return {
      once: vi.fn(),
      listen: (_port: number, _host: string, done: () => void) => done(),
      address: () => ({ port: 12345 }),
    };
  },
}));
import { writeFile } from 'node:fs/promises';
import { startLocalMetaTrafficBridge } from '../src/services/local-meta-traffic.js';

describe('period synchronization queue', () => {
  beforeEach(() => vi.clearAllMocks());
  it('does not require or load a Meta token when reading server snapshots', async () => {
    await expect(startLocalMetaTrafficBridge(null)).rejects.toThrow('Credencial inválida');
    const bridge = await startLocalMetaTrafficBridge(null, vi.fn(), 'server');
    expect(bridge.state.source).toBe('server');
  });
  it('does not lose a period requested during another import and writes independent snapshots', async () => {
    let finish: (value: unknown) => void = () => {};
    const first = new Promise((resolve) => {
      finish = resolve;
    });
    const result = (day: string) => ({
      snapshot: { from: day, to: day, fetchedAt: `${day}T20:00:00.000Z` },
      inventory: [],
    });
    const reader = vi
      .fn()
      .mockImplementationOnce(() => first)
      .mockResolvedValueOnce(result('2026-11-08'));
    const bridge = await startLocalMetaTrafficBridge('synthetic-token'.repeat(5), reader);
    const config = JSON.parse(String(vi.mocked(writeFile).mock.calls[0]?.[1]));
    const send = (day: string) => {
      const req = Object.assign(new EventEmitter(), {
        headers: { 'x-tmx-local-key': config.key },
        method: 'POST',
        url: '/refresh',
        destroy: vi.fn(),
      });
      const res = { setHeader: vi.fn(), writeHead: vi.fn(), end: vi.fn() };
      fake.handler(req as unknown as IncomingMessage, res as unknown as ServerResponse);
      req.emit('data', JSON.stringify({ from: day, to: day }));
      req.emit('end');
      return res;
    };
    expect(send('2026-11-07').writeHead).toHaveBeenCalledWith(202);
    expect(send('2026-11-08').writeHead).toHaveBeenCalledWith(202);
    expect(reader).toHaveBeenCalledTimes(1);
    finish(result('2026-11-07'));
    await new Promise((resolve) => setImmediate(resolve));
    expect(reader.mock.calls.map((call) => call.slice(1))).toEqual([
      ['2026-11-07', '2026-11-07'],
      ['2026-11-08', '2026-11-08'],
    ]);
    expect(bridge.state.busy).toBe(false);
    expect(bridge.state.from).toBe('2026-11-08');
    const paths = vi.mocked(writeFile).mock.calls.map((call) => String(call[0]));
    expect(
      paths.some((path) => path.endsWith('meta-campaigns-2026-11-07-2026-11-07.json.tmp')),
    ).toBe(true);
    expect(
      paths.some((path) => path.endsWith('meta-campaigns-2026-11-08-2026-11-08.json.tmp')),
    ).toBe(true);
  });
});
