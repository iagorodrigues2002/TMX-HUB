import { describe, expect, it, vi } from 'vitest';
import { inventoryAccountStatus, readMetaInventory } from '../src/services/meta-inventory.js';

const account = {
  id: 'act_12',
  name: 'Conta',
  account_status: 1,
  business: { id: '34', name: 'BM' },
};
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
describe('read-only Meta inventory', () => {
  it('keeps credentials out of URLs and follows cursors on the fixed host', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          data: [account],
          paging: { next: 'https://untrusted.invalid/steal', cursors: { after: 'cursor' } },
        }),
      )
      .mockResolvedValueOnce(response({ data: [{ ...account, id: 'act_13', account_status: 3 }] }));
    const result = await readMetaInventory({ token: 'test-secret', version: 'v25.0' }, fetcher);
    expect(result.accounts).toHaveLength(2);
    expect(result.businesses).toHaveLength(1);
    expect(result.businesses[0]!.status).toBeNull();
    expect(result.accounts[1]!.status).toBeNull();
    for (const [url, options] of fetcher.mock.calls) {
      expect(url.origin).toBe('https://graph.facebook.com');
      expect(url.toString()).not.toContain('test-secret');
      expect(options.headers.Authorization).toBe('Bearer test-secret');
    }
    expect(fetcher.mock.calls[1]![0].searchParams.get('after')).toBe('cursor');
  });
  it('supports app proof and rejects partial or repeated pagination', async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(async () =>
        response({ data: [account], paging: { next: 'x', cursors: { after: 'same' } } }),
      );
    await expect(
      readMetaInventory({ token: 'test-secret', appSecret: 'secret', version: 'v25.0' }, fetcher),
    ).rejects.toThrow('Paginação incompleta');
    expect(fetcher.mock.calls[0]![0].searchParams.get('appsecret_proof')).toMatch(/^[a-f0-9]{64}$/);
    const failure = vi
      .fn()
      .mockResolvedValueOnce(
        response({ data: [account], paging: { next: 'x', cursors: { after: 'more' } } }),
      )
      .mockResolvedValueOnce(response({ error: { message: 'test-secret' } }, 400));
    await expect(
      readMetaInventory({ token: 'test-secret', version: 'v25.0' }, failure),
    ).rejects.toThrow('Não foi possível consultar');
  });
  it('validates identity and API version, preserving unknown status', async () => {
    expect(inventoryAccountStatus(1)).toBe('Ativo');
    expect(inventoryAccountStatus(2)).toBe('Desabilitado');
    expect(inventoryAccountStatus(3)).toBeNull();
    expect(inventoryAccountStatus(undefined)).toBeNull();
    await expect(readMetaInventory({ token: 'x', version: '../../bad' }, vi.fn())).rejects.toThrow(
      'Versão',
    );
    await expect(
      readMetaInventory(
        { token: 'x', version: 'v25.0' },
        vi.fn().mockResolvedValue(response({ data: [{ ...account, id: 'bad' }] })),
      ),
    ).rejects.toThrow('Resposta de inventário');
  });
});
