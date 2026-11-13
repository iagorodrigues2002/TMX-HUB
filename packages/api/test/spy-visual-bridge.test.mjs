import { test } from 'vitest';
import assert from 'node:assert/strict';
import { parseProviderRequest } from '../scripts/ai-preview-bridge.mjs';
test('bridge accepts bounded inline frames, rejects external URLs and tools', () => {
  const body = { model: 'gpt-6.1-sol', instructions: 'Compare', input: [{ role: 'user', content: [{ type: 'input_image', image_url: 'data:image/jpeg;base64,YWJj', detail: 'high' }] }], store: false, service_tier: 'default', prompt_cache_options: { mode: 'explicit' }, reasoning: { effort: 'low' }, max_output_tokens: 3000 };
  assert.equal(parseProviderRequest('/responses', body).success, true);
  assert.equal(parseProviderRequest('/responses', { ...body, tools: [{ type: 'web_search' }] }).success, false);
  assert.equal(parseProviderRequest('/responses', { ...body, input: [{ role: 'user', content: [{ type: 'input_image', image_url: 'https://example.com/private.jpg', detail: 'high' }] }] }).success, false);
  assert.equal(parseProviderRequest('/responses', { ...body, store: true }).success, false);
});
