import { lookup } from 'node:dns';
import { chmod, mkdtemp, rm } from 'node:fs/promises';
import {
  type IncomingHttpHeaders,
  type IncomingMessage,
  type ServerResponse,
  createServer,
  request,
} from 'node:http';
import { type AddressInfo, type Socket, connect, isIP } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPublicLookup, publicHttpUrl } from './public-network.js';

const IDLE_TIMEOUT_MS = 30_000;
const MAX_CONNECTIONS = 64;
const HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

function forwardedHeaders(headers: IncomingHttpHeaders): IncomingHttpHeaders {
  const nominated = new Set(
    headers.connection
      ?.toLowerCase()
      .split(',')
      .map((name) => name.trim()),
  );
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => !HOP_HEADERS.has(name) && !nominated.has(name)),
  );
}

/** TCP mode binds only loopback, using a fresh port for each media process. */
export async function startPublicEgressProxy(
  options: { resolver?: typeof lookup; tcp?: boolean } = {},
): Promise<{
  socketPath: string;
  proxyUrl: string;
  close: () => Promise<void>;
}> {
  const directory = await mkdtemp(join(tmpdir(), 'tmx-egress-'));
  const socketPath = join(directory, 'proxy.sock');
  const checkedLookup = createPublicLookup(options.resolver ?? lookup);
  const sockets = new Set<Socket>();
  let activeRequests = 0;
  let closing: Promise<void> | undefined;

  function track(socket: Socket): Socket {
    sockets.add(socket);
    socket.setTimeout(IDLE_TIMEOUT_MS, () => socket.destroy());
    socket.on('error', () => socket.destroy());
    socket.once('close', () => sockets.delete(socket));
    return socket;
  }

  async function destination(raw: string): Promise<{ url: URL; address: string; family: number }> {
    const url = publicHttpUrl(raw);
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    const family = isIP(hostname);
    if (family) return { url, address: hostname, family };
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Destination lookup timed out.')), 5_000);
      checkedLookup(hostname, { all: false }, (error, address, resolvedFamily) => {
        clearTimeout(timeout);
        if (error) reject(error);
        else resolve({ url, address, family: resolvedFamily });
      });
    });
  }

  function rejectHttp(response: ServerResponse, status = 403): void {
    if (response.headersSent) response.destroy();
    else
      response
        .writeHead(status, { connection: 'close', 'content-type': 'text/plain' })
        .end('Egress request denied.');
  }

  async function forwardHttp(incoming: IncomingMessage, response: ServerResponse): Promise<void> {
    if (activeRequests >= MAX_CONNECTIONS || closing) return rejectHttp(response, 503);
    activeRequests += 1;
    let released = false;
    const release = () => {
      if (!released) activeRequests -= 1;
      released = true;
    };
    response.once('close', release);
    response.once('finish', release);
    let target: Awaited<ReturnType<typeof destination>>;
    try {
      if (!incoming.url?.startsWith('http://')) throw new Error('Absolute HTTP URL required.');
      target = await destination(incoming.url);
    } catch {
      rejectHttp(response);
      return;
    }
    if (incoming.destroyed || response.destroyed || closing) return;
    const headers = forwardedHeaders(incoming.headers);
    headers.host = target.url.host;
    // Dial the checked literal, not its hostname: redirects return to the client for a new check.
    const upstream = request(
      {
        hostname: target.address,
        family: target.family,
        port: Number(target.url.port || 80),
        path: `${target.url.pathname}${target.url.search}`,
        method: incoming.method,
        headers,
        agent: false,
        maxHeaderSize: 16 * 1024,
        timeout: IDLE_TIMEOUT_MS,
      },
      (result) => {
        result.on('error', () => response.destroy());
        response.writeHead(result.statusCode ?? 502, forwardedHeaders(result.headers));
        result.pipe(response);
      },
    );
    upstream.on('socket', track);
    upstream.on('timeout', () => upstream.destroy());
    upstream.on('error', () => rejectHttp(response, 502));
    incoming.on('aborted', () => upstream.destroy());
    response.on('close', () => upstream.destroy());
    incoming.pipe(upstream);
  }

  async function forwardTunnel(
    incoming: IncomingMessage,
    client: Socket,
    head: Buffer,
  ): Promise<void> {
    if (activeRequests >= MAX_CONNECTIONS || closing) {
      client.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');
      return;
    }
    activeRequests += 1;
    client.once('close', () => {
      activeRequests -= 1;
    });
    let target: Awaited<ReturnType<typeof destination>>;
    let port: number;
    try {
      const authority = incoming.url ?? '';
      const match = /^(?:\[[0-9a-fA-F:.]+\]|[a-zA-Z0-9.-]+):([0-9]+)$/.exec(authority);
      port = Number(match?.[1]);
      if (!match || port < 1 || port > 65535) throw new Error('Invalid CONNECT authority.');
      target = await destination(`https://${authority}`);
    } catch {
      client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    if (client.destroyed || closing) return;
    const upstream = track(connect({ host: target.address, family: target.family, port }));
    let established = false;
    upstream.once('connect', () => {
      established = true;
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstream.write(head);
      client.pipe(upstream);
      upstream.pipe(client);
    });
    upstream.once('error', () => {
      if (!established && !client.destroyed)
        client.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
      else client.destroy();
    });
    upstream.once('close', () => client.destroy());
    client.once('close', () => upstream.destroy());
  }

  const server = createServer(
    {
      maxHeaderSize: 16 * 1024,
      headersTimeout: 10_000,
      requestTimeout: IDLE_TIMEOUT_MS,
      keepAliveTimeout: 5_000,
    },
    (incoming, response) => {
      void forwardHttp(incoming, response).catch(() => rejectHttp(response, 502));
    },
  );
  server.maxConnections = MAX_CONNECTIONS;
  server.maxRequestsPerSocket = 32;
  server.on('connection', track);
  server.on('connect', (incoming, client, head) => {
    void forwardTunnel(incoming, client as Socket, head).catch(() => client.destroy());
  });
  server.on('upgrade', (_incoming, socket) =>
    socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'),
  );
  server.on('clientError', (_error, socket) => socket.destroy());

  const close = (): Promise<void> => {
    closing ??= (async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(directory, { recursive: true, force: true });
    })();
    return closing;
  };
  try {
    await chmod(directory, 0o700);
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      const listening = () => {
        server.off('error', reject);
        resolve();
      };
      if (options.tcp) server.listen(0, '127.0.0.1', listening);
      else server.listen(socketPath, listening);
    });
    if (!options.tcp) await chmod(socketPath, 0o600);
    const proxyUrl = options.tcp
      ? `http://127.0.0.1:${(server.address() as AddressInfo).port}`
      : '';
    return { socketPath, proxyUrl, close };
  } catch (error) {
    await close();
    throw error;
  }
}
