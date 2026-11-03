import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError } from '../src/lib/query-client';
import { financeValidationError } from '../src/lib/finance-validation-error';

test('distinguishes provider parsing failures from account conflicts without echoing secrets', () => {
  assert.match(
    financeValidationError(new ApiError('secret', 422, { detail: 'invalid_response' })),
    /formato/,
  );
  assert.doesNotMatch(financeValidationError(new ApiError('secret', 422)), /vinculada|secret/);
  assert.match(financeValidationError(new ApiError('secret', 409)), /Conflito/);
  assert.doesNotMatch(
    financeValidationError(new ApiError('secret', 422, { detail: 'secret' })),
    /secret/,
  );
  assert.match(financeValidationError(new ApiError('secret', 429)), /minuto/);
  assert.match(financeValidationError(new ApiError('secret', 403)), /usuário/);
});
