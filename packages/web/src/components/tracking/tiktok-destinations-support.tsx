'use client';

import type { TikTokDestinationInput } from '@/lib/api-client';

export const TIKTOK_TEST_EVENTS_DOCS =
  'https://business-api.tiktok.com/portal/docs?id=1799004129683458#item-link-Verify%20TikTok%20Events%20API%20Setup';

export const empty: TikTokDestinationInput = {
  name: '',
  pixel_code: '',
  access_token: '',
  test_event_code: null,
  enabled: true,
};

export type TikTokTestContext = { code: string; eventUrl: string; email: string; phone: string };

export const emptyTest: TikTokTestContext = { code: '', eventUrl: '', email: '', phone: '' };
