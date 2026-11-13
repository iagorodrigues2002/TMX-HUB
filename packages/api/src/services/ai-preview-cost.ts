import { z } from 'zod';

export const AI_MODEL = 'gpt-6.1-sol';
export const MAX_INPUT_TOKENS = 50_000;
export const MAX_OUTPUT_TOKENS = 3_000;
// Standard tier, USD per million tokens, verified against official pricing on 2026-11-12.
export const AI_PRICES = {
  input: 2,
  cached: 0.1,
  write: 2.5,
  output: 10,
  verifiedAt: '2026-11-12',
};
const tokens = z.number().int().nonnegative().max(2_000_000);
export const usageSchema = z.object({
  input_tokens: tokens,
  output_tokens: tokens,
  total_tokens: tokens,
  input_tokens_details: z.object({ cached_tokens: tokens, cache_write_tokens: tokens }),
});

export function reserveMicros(inputTokens: number) {
  if (!Number.isInteger(inputTokens) || inputTokens < 0 || inputTokens > MAX_INPUT_TOKENS)
    throw Error('INPUT_LIMIT');
  return Math.ceil(inputTokens * AI_PRICES.write + MAX_OUTPUT_TOKENS * AI_PRICES.output);
}

export function costMicros(raw: unknown): number | null {
  const result = z
    .object({ model: z.string(), service_tier: z.literal('default'), usage: usageSchema })
    .safeParse(raw);
  if (
    !result.success ||
    (result.data.model !== AI_MODEL && !result.data.model.startsWith(`${AI_MODEL}-`))
  )
    return null;
  const u = result.data.usage;
  const { cached_tokens: cached, cache_write_tokens: written } = u.input_tokens_details;
  if (
    u.total_tokens !== u.input_tokens + u.output_tokens ||
    cached + written > u.input_tokens ||
    u.input_tokens > MAX_INPUT_TOKENS ||
    u.output_tokens > MAX_OUTPUT_TOKENS
  )
    return null;
  return Math.ceil(
    (u.input_tokens - cached - written) * AI_PRICES.input +
      cached * AI_PRICES.cached +
      written * AI_PRICES.write +
      u.output_tokens * AI_PRICES.output,
  );
}

// Atomic across workers; pending/uncertain charges remain reserved, including after process death.
export const RESERVE_BUDGET = `
if redis.call('EXISTS', KEYS[2]) == 1 then return -1 end
local used = tonumber(redis.call('GET', KEYS[1]) or '0')
local reserve = tonumber(ARGV[1])
if used + reserve > tonumber(ARGV[2]) then return 0 end
redis.call('SET', KEYS[1], used + reserve, 'EX', 3024000)
redis.call('SET', KEYS[2], reserve, 'EX', 3024000)
return 1`;
export const SETTLE_BUDGET = `
local reserve = redis.call('GET', KEYS[2])
if not reserve then return 0 end
local actual = tonumber(ARGV[1])
redis.call('INCRBY', KEYS[1], actual - tonumber(reserve))
redis.call('DEL', KEYS[2])
return 1`;
export const RELEASE_LOCK = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end`;
export const budgetKey = (company: string, day = new Date().toISOString().slice(0, 10)) =>
  `tmx-ai-preview:budget:${company}:${day}`;
