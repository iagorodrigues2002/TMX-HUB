import { test } from 'vitest';
import assert from 'node:assert/strict';
import { parseProviderRequest } from '../scripts/ai-preview-bridge.mjs';
import { audioAnalysisRequest } from '../src/services/spy-audio-analysis.ts';
test('bridge accepts bounded inline frames, rejects external URLs and tools', () => {
  const audio = audioAnalysisRequest('YWJj');
  assert.equal(parseProviderRequest('/audio-analysis', audio).success, true);
  assert.equal(parseProviderRequest('/audio-analysis', { ...audio, store: true }).success, false);
  assert.equal(parseProviderRequest('/audio-analysis', { ...audio, tools: [] }).success, false);
  assert.equal(parseProviderRequest('/transcriptions', { model: 'gpt-transcribe', audio: 'YWJj' }).success, true);
  assert.equal(parseProviderRequest('/transcriptions', { model: 'gpt-transcribe', audio: 'https://example.com/audio' }).success, false);
  assert.equal(parseProviderRequest('/transcriptions', { model: 'other', audio: 'YWJj' }).success, false);
  const body = { model: 'gpt-6.1-sol', instructions: 'Compare', input: [{ role: 'user', content: [{ type: 'input_image', image_url: 'data:image/jpeg;base64,YWJj', detail: 'high' }] }], store: false, service_tier: 'default', prompt_cache_options: { mode: 'explicit' }, reasoning: { effort: 'low' }, max_output_tokens: 3000 };
  assert.equal(parseProviderRequest('/responses', body).success, true);
  assert.equal(parseProviderRequest('/responses', { ...body, tools: [{ type: 'web_search' }] }).success, false);
  assert.equal(parseProviderRequest('/responses', { ...body, input: [{ role: 'user', content: [{ type: 'input_image', image_url: 'https://example.com/private.jpg', detail: 'high' }] }] }).success, false);
  assert.equal(parseProviderRequest('/responses', { ...body, store: true }).success, false);
});
