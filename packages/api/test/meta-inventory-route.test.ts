import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/env.js', () => ({
  env: {
    NODE_ENV: 'production',
    TRACKING_ENCRYPTION_KEY: 'test-key',
    META_GRAPH_API_VERSION: 'v25.0',
  },
}));
vi.mock('../src/lib/secret-box.js', () => ({ decryptSecret: () => 'test-secret' }));
vi.mock('../src/services/meta-inventory.js', () => ({ readMetaInventory: vi.fn() }));
import { registerMetaInventoryRoutes } from '../src/routes/meta-control/get-meta-inventory.js';
import { readMetaInventory } from '../src/services/meta-inventory.js';

describe('Meta inventory authorization and failure handling', () => {
  afterEach(() => vi.clearAllMocks());
  async function app(role = 'admin', rows: unknown[] = []) {
    const server = Fastify();
    server.addHook('preHandler', async (req) => {
      req.user = { role } as typeof req.user;
    });
    const db = vi.fn().mockResolvedValue(rows);
    server.decorate('db', db);
    registerMetaInventoryRoutes(server);
    await server.ready();
    return { server, db };
  }
  it('rejects nonadmins before accessing credentials and requires an explicit connection', async () => {
    const denied = await app('member');
    expect((await denied.server.inject('/meta-control/inventory?connection_id=x')).statusCode).toBe(
      403,
    );
    expect(denied.db).not.toHaveBeenCalled();
    await denied.server.close();
    const admin = await app();
    expect((await admin.server.inject('/meta-control/inventory')).statusCode).toBe(400);
    expect(admin.db).not.toHaveBeenCalled();
    await admin.server.close();
  });
  it('production never reads the local snapshot and missing connections fail closed', async () => {
    const { server, db } = await app();
    expect(
      (await server.inject('/meta-control/inventory?connection_id=local-import')).statusCode,
    ).toBe(409);
    expect(db).toHaveBeenCalledOnce();
    expect(readMetaInventory).not.toHaveBeenCalled();
    await server.close();
  });
  it('sanitizes upstream errors without disclosing credentials', async () => {
    vi.mocked(readMetaInventory).mockRejectedValueOnce(Error('test-secret'));
    const { server } = await app('admin', [
      { access_token_encrypted: 'encrypted', app_secret_encrypted: 'encrypted' },
    ]);
    const result = await server.inject('/meta-control/inventory?connection_id=owned');
    expect(result.statusCode).toBe(502);
    expect(result.body).not.toContain('test-secret');
    expect(result.body).toContain('preservado');
    await server.close();
  });
});
