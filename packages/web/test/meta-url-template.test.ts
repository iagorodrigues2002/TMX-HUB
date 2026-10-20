import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NETWORK_TRACKING_TEMPLATES } from '../src/lib/network-templates';

test('Meta template carries explicit entity IDs and does not invent a fbclid macro', () => {
  const template = NETWORK_TRACKING_TEMPLATES.meta.urlTemplate;
  assert.ok(template.includes('ad_id={{ad.id}}'));
  assert.ok(template.includes('adset_id={{adset.id}}'));
  assert.ok(template.includes('campaign_id={{campaign.id}}'));
  assert.ok(template.includes('utm_content={{ad.name}}'));
  assert.ok(!template.includes('fbclid={{fbclid}}'));
});
