import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canClaimSaleNotice, canPlaySaleNoticeSound } from '../src/lib/sale-notification';
test('background tabs cannot consume another tabs pending sale', () => {
  assert.equal(canClaimSaleNotice(false, false), false);
  assert.equal(canClaimSaleNotice(true, false), false);
  assert.equal(canClaimSaleNotice(true, true), true);
});
test('audio can retry when readiness arrives without falsely marking playback', () => {
  const input = { id: 'sale', previousId: null, visible: true, focused: true, enabled: true };
  assert.equal(canPlaySaleNoticeSound(input), true);
  assert.equal(canPlaySaleNoticeSound({ ...input, previousId: 'sale' }), false);
  assert.equal(canPlaySaleNoticeSound({ ...input, enabled: false }), false);
});
