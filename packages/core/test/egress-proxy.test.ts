import type { lookup } from 'node:dns';
import { once } from 'node:events';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { type IncomingMessage, type RequestOptions, type Server, createServer } from 'node:http';
import { createConnection, createServer as createTcpServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startPublicEgressProxy } from '../src/fetch/egress-proxy.js';

const transport = vi.hoisted(() => ({
  socketPath: '',
  http: [] as RequestOptions[],
  tcp: [] as Array<{ host: string; port: number }>,
}));

// Only the final dial is redirected to a Unix fixture; destination policy is real.
vi.mock('node:http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:http')>();
  return {
    ...actual,
    request: (options: RequestOptions, callback: (response: IncomingMessage) => void) => {
      transport.http.push(options);
      if (!transport.socketPath) throw new Error('Unexpected outbound connection');
      return actual.request(
        { ...options, hostname: undefined, port: undefined, socketPath: transport.socketPath },
        callback,
      );
    },
  };
});

vi.mock('node:net', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:net')>();
  return {
    ...actual,
    connect: (options: { host: string; port: number }) => {
      transport.tcp.push(options);
      if (!transport.socketPath) throw new Error('Unexpected outbound connection');
      return actual.connect({ path: transport.socketPath });
    },
  };
});

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup();
  cleanups.length = 0;
  transport.socketPath = '';
  transport.http.length = 0;
  transport.tcp.length = 0;
});

function dns(addresses = ['8.8.8.8']): typeof lookup {
  return ((_host: string, _options: unknown, callback: (...args: unknown[]) => void) => {
    callback(
      null,
      addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })),
    );
  }) as typeof lookup;
}

async function proxy(resolver = dns()) {
  const result = await startPublicEgressProxy({ resolver });
  cleanups.push(result.close);
  return result;
}

async function fixture(server: Server | ReturnType<typeof createTcpServer>) {
  const dir = await mkdtemp(join(tmpdir(), 'egress-test-'));
  transport.socketPath = join(dir, 'origin.sock');
  server.listen(transport.socketPath);
  await once(server, 'listening');
  cleanups.unshift(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  });
}

async function exchange(socketPath: string, request: string): Promise<string> {
  const socket = createConnection({ path: socketPath });
  socket.setEncoding('utf8');
  socket.setTimeout(2_000, () => socket.destroy(new Error('Fixture timeout')));
  let result = '';
  socket.on('data', (data) => {
    result += data;
  });
  await once(socket, 'connect');
  socket.write(request);
  await once(socket, 'end');
  return result;
}

describe('mandatory sandbox egress proxy', () => {
  it('binds independent loopback ports and still rejects private destinations over TCP', async () => {
    const first = await startPublicEgressProxy({ tcp: true });
    const second = await startPublicEgressProxy({ tcp: true });
    cleanups.push(first.close, second.close);
    expect(new URL(first.proxyUrl).hostname).toBe('127.0.0.1');
    expect(first.proxyUrl).not.toBe(second.proxyUrl);
    const socket = createConnection({
      host: '127.0.0.1',
      port: Number(new URL(first.proxyUrl).port),
    });
    let response = '';
    socket.setEncoding('utf8');
    socket.on('data', (data) => {
      response += data;
    });
    await once(socket, 'connect');
    socket.write(
      'GET http://169.254.169.254/ HTTP/1.1\r\nHost: fixture\r\nConnection: close\r\n\r\n',
    );
    await once(socket, 'end');
    expect(response).toMatch(/^HTTP\/1\.1 403/);
    expect(transport.http).toHaveLength(0);
  });
  it.each([
    'http://127.0.0.1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://10.0.0.1/',
    'http://[::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://[fe80::1]/',
    'http://[fc00::1]/',
    'file:///etc/passwd',
    'http://user:pass@8.8.8.8/',
    '/origin-form',
  ])('blocks %s before opening any destination socket', async (url) => {
    const egress = await proxy();
    const response = await exchange(
      egress.socketPath,
      `GET ${url} HTTP/1.1\r\nHost: fixture\r\nConnection: close\r\n\r\n`,
    );
    expect(response).toMatch(/^HTTP\/1\.1 403/);
    expect(transport.http).toHaveLength(0);
    expect(transport.tcp).toHaveLength(0);
  });

  it.each([['127.0.0.1'], ['8.8.8.8', '10.0.0.1'], ['::1'], []])(
    'rejects private, mixed or empty DNS answers: %j',
    async (...addresses) => {
      const egress = await proxy(dns(addresses));
      const response = await exchange(
        egress.socketPath,
        'CONNECT fixture.test:443 HTTP/1.1\r\nHost: fixture.test\r\n\r\n',
      );
      expect(response).toMatch(/^HTTP\/1\.1 403/);
      expect(transport.tcp).toHaveLength(0);
    },
  );

  it('pins the checked address, forwards one HTTP hop and strips proxy/hop headers', async () => {
    let receivedHeaders: Record<string, unknown> = {};
    await fixture(
      createServer((request, response) => {
        receivedHeaders = request.headers;
        response.writeHead(302, {
          location: 'http://127.0.0.1/private',
          'proxy-authenticate': 'fixture',
          'set-cookie': 'origin=yes',
        });
        response.end('redirect');
      }),
    );
    const egress = await proxy();
    const response = await exchange(
      egress.socketPath,
      'GET http://fixture.test:8080/path?q=1 HTTP/1.1\r\nHost: attacker.invalid\r\nCookie: fixture=yes\r\nAuthorization: Bearer origin\r\nProxy-Authorization: secret\r\nConnection: close, x-hop\r\nX-Hop: private\r\nRange: bytes=0-8\r\n\r\n',
    );
    expect(response).toMatch(/^HTTP\/1\.1 302/);
    expect(response).toContain('location: http://127.0.0.1/private');
    expect(response).not.toContain('proxy-authenticate');
    expect(transport.http).toHaveLength(1);
    expect(transport.http[0]).toMatchObject({ hostname: '8.8.8.8', port: 8080, path: '/path?q=1' });
    expect(receivedHeaders).toMatchObject({
      host: 'fixture.test:8080',
      cookie: 'fixture=yes',
      authorization: 'Bearer origin',
      range: 'bytes=0-8',
    });
    expect(receivedHeaders['proxy-authorization']).toBeUndefined();
    expect(receivedHeaders['x-hop']).toBeUndefined();
  });

  it('rechecks DNS on the next request and never connects to a rebound private address', async () => {
    await fixture(createServer((_request, response) => response.end('public')));
    let calls = 0;
    const resolver = ((
      _host: string,
      _options: unknown,
      callback: (...args: unknown[]) => void,
    ) => {
      calls += 1;
      callback(null, [{ address: calls === 1 ? '8.8.8.8' : '127.0.0.1', family: 4 }]);
    }) as typeof lookup;
    const egress = await proxy(resolver);
    const request =
      'GET http://rebind.test/ HTTP/1.1\r\nHost: rebind.test\r\nConnection: close\r\n\r\n';
    expect(await exchange(egress.socketPath, request)).toMatch(/^HTTP\/1\.1 200/);
    expect(await exchange(egress.socketPath, request)).toMatch(/^HTTP\/1\.1 403/);
    expect(transport.http).toHaveLength(1);
  });

  it('supports CONNECT with a pinned destination and preserves initial tunnel bytes', async () => {
    await fixture(
      createTcpServer((socket) => socket.once('data', (data) => socket.end(`echo:${data}`))),
    );
    const egress = await proxy();
    const response = await exchange(
      egress.socketPath,
      'CONNECT fixture.test:8443 HTTP/1.1\r\nHost: fixture.test:8443\r\n\r\nhello',
    );
    expect(response).toContain('200 Connection Established\r\n\r\necho:hello');
    expect(transport.tcp).toEqual([expect.objectContaining({ host: '8.8.8.8', port: 8443 })]);
  });

  it('allows public IPv6 without a second hostname lookup', async () => {
    await fixture(
      createTcpServer((socket) => socket.once('data', () => socket.end('public-ipv6'))),
    );
    const egress = await proxy(dns(['2606:4700:4700::1111']));
    const response = await exchange(
      egress.socketPath,
      'CONNECT fixture.test:443 HTTP/1.1\r\nHost: fixture\r\n\r\nhello',
    );
    expect(response).toContain('public-ipv6');
    expect(transport.tcp).toEqual([
      expect.objectContaining({ host: '2606:4700:4700::1111', family: 6, port: 443 }),
    ]);
  });

  it('streams request bodies and uses a validated literal without DNS', async () => {
    let receivedBody = '';
    await fixture(
      createServer((request, response) => {
        request.on('data', (data) => {
          receivedBody += data;
        });
        request.on('end', () => response.end(receivedBody));
      }),
    );
    const resolver = vi.fn(() => {
      throw new Error('Literal must not resolve');
    }) as unknown as typeof lookup;
    const egress = await proxy(resolver);
    const response = await exchange(
      egress.socketPath,
      'POST http://8.8.8.8/body HTTP/1.1\r\nHost: fixture\r\nContent-Length: 5\r\nConnection: close\r\n\r\nhello',
    );
    expect(response).toMatch(/^HTTP\/1\.1 200/);
    expect(receivedBody).toBe('hello');
    expect(resolver).not.toHaveBeenCalled();
  });

  it('never opens a destination after shutdown during a pending DNS lookup', async () => {
    let finishLookup: (() => void) | undefined;
    const resolver = ((
      _host: string,
      _options: unknown,
      callback: (...args: unknown[]) => void,
    ) => {
      finishLookup = () => callback(null, [{ address: '8.8.8.8', family: 4 }]);
    }) as typeof lookup;
    const egress = await proxy(resolver);
    const client = createConnection({ path: egress.socketPath });
    client.on('error', () => {});
    await once(client, 'connect');
    client.write('CONNECT fixture.test:443 HTTP/1.1\r\nHost: fixture\r\n\r\n');
    await vi.waitFor(() => expect(finishLookup).toBeTypeOf('function'));
    const closed = once(client, 'close');
    client.resume();
    await egress.close();
    finishLookup?.();
    await closed;
    expect(transport.tcp).toHaveLength(0);
  });

  it.each([
    '127.0.0.1:443',
    '[::1]:443',
    'fixture.test:0',
    'fixture.test:65536',
    'user@fixture.test:443',
    'fixture.test:443/path',
  ])('rejects invalid CONNECT authority %s', async (authority) => {
    const egress = await proxy();
    expect(
      await exchange(egress.socketPath, `CONNECT ${authority} HTTP/1.1\r\nHost: fixture\r\n\r\n`),
    ).toMatch(/^HTTP\/1\.1 403/);
    expect(transport.tcp).toHaveLength(0);
  });

  it('uses owner-only socket access and close removes its own directory and active tunnels', async () => {
    await fixture(createTcpServer(() => {}));
    const egress = await proxy();
    expect((await stat(egress.socketPath)).mode & 0o777).toBe(0o600);
    const client = createConnection({ path: egress.socketPath });
    client.on('error', () => {});
    await once(client, 'connect');
    client.write('CONNECT fixture.test:443 HTTP/1.1\r\nHost: fixture\r\n\r\n');
    await once(client, 'data');
    const closed = once(client, 'close');
    await egress.close();
    await closed;
    await expect(stat(egress.socketPath)).rejects.toMatchObject({ code: 'ENOENT' });
    await egress.close();
  });
});
