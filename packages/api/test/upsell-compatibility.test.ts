import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkUpsellCompatibilityDetailed } from '../src/services/upsell-compatibility.js';

const destination = 'https://example.test/upsell';
const vendaId = '11111111-1111-4111-8111-111111111111';
const upsellId = '22222222-2222-4222-8222-222222222222';

afterEach(() => vi.unstubAllGlobals());

describe('upsell compatibility', () => {
  it('treats an available intent without vendaGeradaId as recoverable', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(`<script>upsellId=${upsellId}</script>`))
      .mockResolvedValueOnce(Response.json({ error: false, data: { vendaId, upsellId, vendaGeradaId: null } }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await checkUpsellCompatibilityDetailed(destination, vendaId, true, {
      retryDelaysMs: [0],
    });
    expect(result).toMatchObject({ compatible: true, state: 'recoverable', attempts: 1 });
  });

  it('separates an intent that already generated an upsell sale', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(`<script>upsellId=${upsellId}</script>`))
      .mockResolvedValueOnce(Response.json({ error: false, data: { vendaId, upsellId, vendaGeradaId: 'sale-id' } }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await checkUpsellCompatibilityDetailed(`${destination}/converted`, vendaId, true, {
      retryDelaysMs: [0],
    });
    expect(result).toMatchObject({ compatible: true, state: 'already_converted' });
  });

  it('retries transient Vendepay failures', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(`<script>upsellId=${upsellId}</script>`))
      .mockResolvedValueOnce(Response.json({ error: true }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ error: false, data: { vendaId, upsellId, vendaGeradaId: null } }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await checkUpsellCompatibilityDetailed(`${destination}/retry`, vendaId, true, {
      retryDelaysMs: [0, 0],
    });
    expect(result).toMatchObject({ compatible: true, state: 'recoverable', attempts: 2 });
  });

  it('records an explicit refusal as definitive', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(`<script>upsellId=${upsellId}</script>`))
      .mockResolvedValueOnce(Response.json({ error: true, message: 'Venda não elegível' }, { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await checkUpsellCompatibilityDetailed(`${destination}/refused`, vendaId, true, {
      retryDelaysMs: [0, 0],
    });
    expect(result).toMatchObject({ compatible: false, state: 'definitive_failure', attempts: 1 });
  });
});
