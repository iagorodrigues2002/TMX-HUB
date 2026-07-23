import type { Offer } from '@page-cloner/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_AI_ROLE,
  DEFAULT_AI_TEMPLATE,
  generateCampaignAnalysis,
} from '../src/services/campaign-ai.js';
import type { IntradaySummary } from '../src/services/intraday-store.js';
import type { OfferAiSecretConfig } from '../src/services/offer-store.js';

const offer: Offer = {
  id: 'offer-sdm',
  userId: 'admin-1',
  name: 'SDM',
  currency: 'BRL',
  status: 'escala',
  createdAt: '2026-07-01T00:00:00.000Z',
};

const summary: IntradaySummary = {
  date: '2026-07-23',
  overall: {
    spend: 628.11,
    revenue: 976.06,
    sales: 5,
    ic: 20,
    cpa: 125.622,
    icCpa: 31.4055,
    conversionRate: 0.25,
    roas: 1.553974,
  },
  overallAds: [
    {
      name: 'ad3-l14',
      spend: 200,
      revenue: 300,
      sales: 2,
      ic: 6,
      cpa: 100,
      icCpa: 33.333,
      conversionRate: 0.333,
      roas: 1.5,
    },
  ],
  currentWindowIndex: 7,
  windows: [],
};

const config: OfferAiSecretConfig = {
  apiKey: 'opencode-secret-key',
  provider: 'opencode-go',
  model: 'deepseek-v4-flash',
  role: DEFAULT_AI_ROLE,
  template: DEFAULT_AI_TEMPLATE,
  responsible: 'Iago Rodrigues',
  minRoas: 1.6,
  tone: 'direto',
  includeAds: true,
  autoGenerate: false,
  scheduleHours: [],
};

afterEach(() => vi.unstubAllGlobals());

describe('campaign AI analysis', () => {
  it('sends calculated data to OpenCode and formats the fixed report safely', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output: [{ content: [{ type: 'output_text', text: 'ROAS próximo da meta.' }] }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateCampaignAnalysis({
      offer,
      summary,
      config,
      history: [
        {
          id: 'analysis-old',
          offerId: offer.id,
          model: config.model,
          text: 'Relatório anterior',
          observation: 'A janela das 10h às 12h ficou sem vendas.',
          metrics: { spend: 400, revenue: 500, sales: 3, ic: 12, cpa: 133.33, roas: 1.25 },
          windows: [{ label: '10h–12h', spend: 120, revenue: 0, sales: 0, cpa: null, roas: 0 }],
          feedback: 'Reduzi o orçamento e a janela seguinte recuperou.',
          createdAt: '2026-07-23T13:00:00.000Z',
        },
      ],
      now: new Date('2026-07-23T17:00:00.000Z'),
    });

    expect(result.text).toContain('[SDM {23/07 14:00} — ATUALIZAÇÃO]');
    expect(result.text).toContain('Responsável: Iago Rodrigues');
    expect(result.text).toContain('GASTO: R$ 628,11');
    expect(result.text).toContain('FATURAMENTO: R$ 976,06');
    expect(result.text).toContain('ROAS: 1,55');
    expect(result.text).toContain('OBS: ROAS próximo da meta.');

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(options.headers).toMatchObject({
      authorization: 'Bearer opencode-secret-key',
    });
    const body = JSON.parse(String(options.body));
    expect(body.model).toBe('deepseek-v4-flash');
    expect(body.messages).toHaveLength(2);
    expect(JSON.stringify(body.messages)).toContain('ad3-l14');
    expect(JSON.stringify(body.messages)).toContain('Reduzi o orçamento');
    expect(JSON.stringify(body.messages)).toContain('A janela das 10h às 12h');
    expect(result.metrics).toMatchObject({ spend: 628.11, revenue: 976.06, sales: 5 });
  });

  it('surfaces provider errors without exposing the API key', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: 'saldo insuficiente' } }), {
          status: 402,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    await expect(
      generateCampaignAnalysis({
        offer,
        summary,
        config,
        now: new Date('2026-07-23T17:00:00.000Z'),
      }),
    ).rejects.toThrow('A conta OpenCode está sem créditos');
  });

  it('preserves a useful error when the provider returns a non-JSON response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('upstream temporarily unavailable', {
          status: 503,
          headers: { 'content-type': 'text/plain' },
        }),
      ),
    );

    await expect(
      generateCampaignAnalysis({
        offer,
        summary,
        config,
        now: new Date('2026-07-23T17:00:00.000Z'),
      }),
    ).rejects.toThrow(
      'A OpenCode está temporariamente indisponível (HTTP 503). Detalhe: upstream temporarily unavailable',
    );
  });

  it('uses the OpenAI-compatible chat endpoint for DeepSeek', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'A janela atual está abaixo da meta.' } }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateCampaignAnalysis({
      offer,
      summary,
      config: { ...config, model: 'kimi-k2.6' },
      now: new Date('2026-07-23T17:00:00.000Z'),
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://opencode.ai/zen/go/v1/chat/completions');
    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(body.messages).toHaveLength(2);
    expect(result.observation).toBe('A janela atual está abaixo da meta.');
  });

  it('extracts text blocks returned by OpenCode Go models', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: [
                    { type: 'text', text: 'A janela das 10h às 12h teve baixo retorno.' },
                    { type: 'text', text: 'O acumulado segue próximo da meta.' },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );

    const result = await generateCampaignAnalysis({
      offer,
      summary,
      config,
      now: new Date('2026-07-23T17:00:00.000Z'),
    });

    expect(result.observation).toBe(
      'A janela das 10h às 12h teve baixo retorno.\nO acumulado segue próximo da meta.',
    );
  });

  it('uses reasoning content when a Go model omits the regular content field', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: null,
                  reasoning_content: 'Os dados ainda são insuficientes para recomendar cortes.',
                },
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );

    const result = await generateCampaignAnalysis({
      offer,
      summary,
      config,
      now: new Date('2026-07-23T17:00:00.000Z'),
    });

    expect(result.observation).toBe('Os dados ainda são insuficientes para recomendar cortes.');
  });
});
