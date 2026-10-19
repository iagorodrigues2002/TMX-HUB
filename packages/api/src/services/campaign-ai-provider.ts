import type { OfferAiSecretConfig } from './offer-store.js';

export const OPENCODE_MODELS = [
  { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash · recomendado e econômico' },
  { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro · análise avançada' },
  { id: 'kimi-k2.6', label: 'Kimi K2.6 · análise detalhada' },
  { id: 'kimi-k2.7-code', label: 'Kimi K2.7 Code · raciocínio avançado' },
  { id: 'kimi-k3', label: 'Kimi K3 · alta capacidade' },
  { id: 'glm-5.2', label: 'GLM 5.2 · análise avançada' },
  { id: 'grok-4.5', label: 'Grok 4.5 · alta capacidade' },
  { id: 'mimo-v2.5', label: 'MiMo V2.5 · mais econômico' },
] as const;

export async function callOpenCode(config: OfferAiSecretConfig, prompt: string): Promise<string> {
  const selected = OPENCODE_MODELS.find((model) => model.id === config.model);
  if (!selected) throw new Error(`Modelo OpenCode Go não suportado: ${config.model}.`);
  const url = 'https://opencode.ai/zen/go/v1/chat/completions';
  const requestBody = JSON.stringify({
    model: config.model,
    max_tokens: 3_000,
    messages: [
      { role: 'system', content: config.role },
      { role: 'user', content: prompt },
    ],
  });

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        'content-type': 'application/json',
      },
      body: requestBody,
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      return finalizeWithMimo(
        config,
        prompt,
        'O modelo principal excedeu o tempo limite antes de produzir um rascunho.',
      );
    }
    throw new Error(
      `Não foi possível conectar à OpenCode: ${error instanceof Error ? error.message : 'falha de rede'}.`,
    );
  }

  const responseText = await response.text();
  const payload = safeJsonObject(responseText);
  if (!response.ok) {
    const detail =
      typeof payload?.error === 'object' && payload.error
        ? String((payload.error as Record<string, unknown>).message ?? '')
        : typeof payload?.message === 'string'
          ? payload.message
          : responseText.trim().slice(0, 300);
    throw new Error(
      `${providerStatusMessage(response.status)}${detail ? ` Detalhe: ${detail}` : ''}`,
    );
  }
  const direct = extractContentText(payload?.output_text);
  if (direct) return direct;
  const choices = Array.isArray(payload?.choices) ? payload.choices : [];
  const firstChoice = choices[0] as Record<string, unknown> | undefined;
  const message = firstChoice?.message as Record<string, unknown> | undefined;
  const messageContent = extractContentText(message?.content);
  if (messageContent) return messageContent;
  const choiceText = extractContentText(firstChoice?.text);
  if (choiceText) return choiceText;
  const reasoningContent = extractContentText(
    message?.reasoning_content ?? message?.reasoning ?? firstChoice?.reasoning_content,
  );
  const finishReason = extractContentText(firstChoice?.finish_reason);
  if (reasoningContent && finishReason === 'length') {
    return finalizeWithMimo(config, prompt, reasoningContent);
  }
  const rootContent = extractContentText(payload?.content);
  if (rootContent) return rootContent;
  const output = Array.isArray(payload?.output) ? payload.output : [];
  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const content = extractContentText((item as Record<string, unknown>).content);
    if (content) return content;
  }
  throw new Error(
    `O OpenCode respondeu sem um texto de análise${
      finishReason ? ` (finalização: ${finishReason})` : ''
    }. Tente novamente ou selecione outro modelo do OpenCode Go.`,
  );
}

export async function finalizeWithMimo(
  config: OfferAiSecretConfig,
  originalPrompt: string,
  reasoning: string,
): Promise<string> {
  const compactPrompt =
    originalPrompt.length <= 30_000
      ? originalPrompt
      : `${originalPrompt.slice(0, 10_000)}

[contexto intermediário resumido para reduzir latência]

${originalPrompt.slice(-20_000)}`;
  const response = await fetch('https://opencode.ai/zen/go/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'mimo-v2.5',
      max_tokens: 1_600,
      messages: [
        {
          role: 'system',
          content:
            'Você é um editor de relatórios de tráfego. Responda somente com o relatório final em português do Brasil. Não mostre raciocínio, planejamento ou cálculos intermediários.',
        },
        {
          role: 'user',
          content: `INSTRUÇÕES E DADOS ORIGINAIS
${compactPrompt}

RASCUNHO INTERNO DO PRIMEIRO MODELO
${reasoning.slice(0, 12_000)}

Transforme o conteúdo acima no relatório final solicitado. Preserve exatamente os números fornecidos e não acrescente explicações sobre esta tarefa.`,
        },
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  });
  const responseText = await response.text();
  const payload = safeJsonObject(responseText);
  if (!response.ok) {
    const detail =
      typeof payload?.error === 'object' && payload.error
        ? String((payload.error as Record<string, unknown>).message ?? '')
        : responseText.trim().slice(0, 300);
    throw new Error(
      `A OpenCode não conseguiu finalizar a análise (${response.status})${
        detail ? `: ${detail}` : '.'
      }`,
    );
  }
  const choices = Array.isArray(payload?.choices) ? payload.choices : [];
  const firstChoice = choices[0] as Record<string, unknown> | undefined;
  const message = firstChoice?.message as Record<string, unknown> | undefined;
  const text =
    extractContentText(message?.content) ||
    extractContentText(firstChoice?.text) ||
    extractContentText(payload?.content);
  if (text) return text;
  throw new Error('A OpenCode concluiu o processamento, mas não gerou o relatório final.');
}

export function extractContentText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) {
    return value
      .map((item) => extractContentText(item))
      .filter(Boolean)
      .join('\n')
      .trim();
  }
  if (!value || typeof value !== 'object') return '';
  const object = value as Record<string, unknown>;
  for (const key of ['text', 'content', 'value', 'output_text']) {
    const text = extractContentText(object[key]);
    if (text) return text;
  }
  return '';
}

export function safeJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function providerStatusMessage(status: number): string {
  if (status === 401 || status === 403) {
    return 'A OpenCode recusou a chave API. Confira a chave salva e a conta utilizada.';
  }
  if (status === 402) {
    return 'A conta OpenCode está sem créditos ou com a cobrança pendente.';
  }
  if (status === 404) {
    return 'O modelo selecionado não está disponível na OpenCode.';
  }
  if (status === 429) {
    return 'A OpenCode atingiu o limite de requisições. Aguarde alguns instantes.';
  }
  if (status >= 500) {
    return `A OpenCode está temporariamente indisponível (HTTP ${status}).`;
  }
  return `A OpenCode recusou a análise (HTTP ${status}).`;
}
