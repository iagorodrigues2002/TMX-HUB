import { publicFetch } from '@page-cloner/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkUpsellCompatibilityDetailed } from '../src/services/upsell-compatibility.js';

vi.mock('@page-cloner/core', () => ({ publicFetch: vi.fn() }));

const destination = 'https://example.test/upsell';
const vendaId = '11111111-1111-4111-8111-111111111111';
const upsellId = '22222222-2222-4222-8222-222222222222';
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.mocked(publicFetch)
    .mockReset()
    .mockResolvedValue(new Response(`<script>upsellId=${upsellId}</script>`));
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe('upsell compatibility', () => {
  it('treats an available intent without vendaGeradaId as recoverable', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ error: false, data: { vendaId, upsellId, vendaGeradaId: null } }),
    );
    const result = await checkUpsellCompatibilityDetailed(destination, vendaId, true, {
      retryDelaysMs: [0],
    });
    expect(result).toMatchObject({ compatible: true, state: 'recoverable', attempts: 1 });
    expect(publicFetch).toHaveBeenCalledOnce();
    expect(publicFetch).toHaveBeenCalledWith(destination, {
      signal: expect.any(AbortSignal),
      headers: { 'user-agent': 'TMX-Upsell-Validator/2.0' },
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      new URL(
        `https://bff.vendepay.com/api/up-sell/intent?upsellId=${upsellId}&vendaId=${vendaId}`,
      ),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('separates an intent that already generated an upsell sale', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ error: false, data: { vendaId, upsellId, vendaGeradaId: 'sale-id' } }),
    );
    const result = await checkUpsellCompatibilityDetailed(
      `${destination}/converted`,
      vendaId,
      true,
      {
        retryDelaysMs: [0],
      },
    );
    expect(result).toMatchObject({ compatible: true, state: 'already_converted' });
  });

  it('retries transient Vendepay failures', async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json({ error: true }, { status: 503 }))
      .mockResolvedValueOnce(
        Response.json({ error: false, data: { vendaId, upsellId, vendaGeradaId: null } }),
      );
    const result = await checkUpsellCompatibilityDetailed(`${destination}/retry`, vendaId, true, {
      retryDelaysMs: [0, 0],
    });
    expect(result).toMatchObject({ compatible: true, state: 'recoverable', attempts: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('records an explicit refusal as definitive', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ error: true, message: 'Venda não elegível' }, { status: 400 }),
    );
    const result = await checkUpsellCompatibilityDetailed(`${destination}/refused`, vendaId, true, {
      retryDelaysMs: [0, 0],
    });
    expect(result).toMatchObject({ compatible: false, state: 'definitive_failure', attempts: 1 });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('does not fall back to unrestricted fetch when the public transport rejects a destination', async () => {
    vi.mocked(publicFetch).mockRejectedValueOnce(
      new Error('Destination resolves to a non-public address.'),
    );
    const result = await checkUpsellCompatibilityDetailed(`${destination}/blocked`, vendaId, true);
    expect(result).toMatchObject({
      compatible: false,
      state: 'temporary_failure',
      reason: 'Destination resolves to a non-public address.',
      attempts: 0,
      httpStatus: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    {
      path: 'http-error',
      status: 503,
      html: `upsellId=${upsellId}`,
      reason: 'destination_http_503',
    },
    { path: 'missing-id', status: 200, html: '<html></html>', reason: 'upsell_id_not_found' },
  ])('does not call Vendepay for destination $path', async ({ path, status, html, reason }) => {
    vi.mocked(publicFetch).mockResolvedValueOnce(new Response(html, { status }));
    const result = await checkUpsellCompatibilityDetailed(`${destination}/${path}`, vendaId, true);
    expect(result).toMatchObject({
      compatible: false,
      state: 'temporary_failure',
      reason,
      attempts: 0,
      httpStatus: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
