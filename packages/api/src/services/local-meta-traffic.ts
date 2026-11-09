import { randomBytes } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';

// biome-ignore lint/suspicious/noExplicitAny: Graph objects are polymorphic; the API validates the persisted snapshot schema before exposure.
type Row = Record<string, any>;
const directory = () => join(homedir(), '.codex/local-data/tmx');
export {
  readMetaTraffic as readLocalMetaTraffic,
  validTrafficRange,
} from './meta-traffic-reader.js';
import {
  readMetaTraffic as readLocalMetaTraffic,
  validTrafficRange,
} from './meta-traffic-reader.js';

/** Local read-only bridge: Meta credential stays in this process, never in the API/browser or a file. */
export async function startLocalMetaTrafficBridge(
  token: string | null,
  reader = readLocalMetaTraffic,
  source: 'local' | 'server' = 'local',
) {
  if (source === 'local' && (!token || token.length < 40)) throw Error('Credencial inválida.');
  await mkdir(directory(), { recursive: true, mode: 0o700 });
  const key = randomBytes(32).toString('hex');
  const state = {
    connected: true,
    source,
    blocked: false,
    busy: false,
    from: '',
    to: '',
    updatedAt: '',
    error: '',
  };
  let queuedRange: { from: string; to: string } | null = null;
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Cache-Control', 'no-store');
    const send = (status: number, body: unknown) => {
      response.writeHead(status);
      response.end(JSON.stringify(body));
    };
    if (request.headers['x-tmx-local-key'] !== key) return send(403, { error: 'forbidden' });
    if (request.method === 'GET' && request.url === '/status') return send(200, state);
    if (request.method !== 'POST' || request.url !== '/refresh')
      return send(404, { error: 'not_found' });
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1024) request.destroy();
    });
    request.on('end', () => {
      let range: { from: string; to: string };
      try {
        range = JSON.parse(body);
        if (!validTrafficRange(range.from, range.to)) return send(400, { error: 'invalid_range' });
      } catch {
        return send(400, { error: 'invalid_range' });
      }
      if (state.busy) {
        if (range.from !== state.from || range.to !== state.to) queuedRange = range;
        return send(202, state);
      }
      Object.assign(state, {
        busy: true,
        blocked: false,
        from: range.from,
        to: range.to,
        error: '',
      });
      send(202, state);
      const run = async (range: { from: string; to: string }) => {
        Object.assign(state, {
          busy: true,
          blocked: false,
          from: range.from,
          to: range.to,
          error: '',
        });
        try {
          const { snapshot, inventory } = await reader(token ?? '', range.from, range.to);
          const file = join(directory(), 'meta-campaigns.json');
          await writeFile(`${file}.tmp`, JSON.stringify(snapshot), { mode: 0o600 });
          await rename(`${file}.tmp`, file);
          const periodFile = join(directory(), `meta-campaigns-${range.from}-${range.to}.json`);
          await writeFile(`${periodFile}.tmp`, JSON.stringify(snapshot), { mode: 0o600 });
          await rename(`${periodFile}.tmp`, periodFile);
          const business = new Map<string, Row>();
          for (const a of inventory)
            if (a.business?.id)
              business.set(a.business.id, {
                id: a.business.id,
                name: a.business.name,
                status: null,
              });
          const assets = {
            businesses: [...business.values()],
            accounts: inventory.map((a) => ({
              id: a.id,
              name: a.name,
              businessId: a.business?.id ?? null,
              status:
                Number(a.account_status) === 1
                  ? 'Ativo'
                  : [2, 100, 101, 202].includes(Number(a.account_status))
                    ? 'Desabilitado'
                    : null,
            })),
            fetchedAt: snapshot.fetchedAt,
            coverage: 'businesses_from_assigned_accounts',
          };
          await writeFile(join(directory(), 'meta-inventory.json.tmp'), JSON.stringify(assets), {
            mode: 0o600,
          });
          await rename(
            join(directory(), 'meta-inventory.json.tmp'),
            join(directory(), 'meta-inventory.json'),
          );
          state.updatedAt = snapshot.fetchedAt;
        } catch (error) {
          state.error =
            error instanceof Error
              ? error.message
              : 'Não foi possível atualizar. Dados anteriores preservados.';
          state.blocked = state.error.includes('API access blocked');
        } finally {
          if (queuedRange) {
            const next = queuedRange;
            queuedRange = null;
            void run(next);
          } else state.busy = false;
        }
      };
      void run(range);
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('Bridge indisponível.');
  await writeFile(
    join(directory(), 'meta-bridge.json'),
    JSON.stringify({ port: address.port, key }),
    { mode: 0o600 },
  );
  return { server, state };
}
