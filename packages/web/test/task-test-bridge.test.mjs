import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allowedTaskRequest, forwardTaskBody } from '../../api/scripts/task-test-bridge.mjs';
const secret = 'synthetic-task-test-bridge-credential-12345';
test('test bridge exposes only authenticated task automation, never commercial or admin routes', () => {
  assert.equal(allowedTaskRequest('GET', '/v1/task-automation/people', secret, secret), true);
  assert.equal(allowedTaskRequest('POST', '/v1/task-automation/events', secret, secret), true);
  for (const path of [
    '/v1/tasks',
    '/v1/auth/me',
    '/v1/webhooks/vendepay',
    '/v1/offers',
    '/v1/task-automation/../auth/me',
  ])
    assert.equal(allowedTaskRequest('GET', path, secret, secret), false);
  assert.equal(allowedTaskRequest('GET', '/v1/task-automation/people', 'invalid', secret), false);
  assert.equal(allowedTaskRequest('DELETE', '/v1/task-automation/people', secret, secret), false);
});
test('empty claim requests are not sent as invalid empty JSON', () => {
  assert.deepEqual(forwardTaskBody([]), { headers: {} });
  const request = forwardTaskBody([Buffer.from('{}')]);
  assert.equal(request.headers['content-type'], 'application/json');
  assert.equal(request.body.toString(), '{}');
});
