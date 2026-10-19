import { env } from '../../env.js';

export async function provisionYoutubeRewardsAccount(input: {
  offer: 'PJR_ENG' | 'PJR_ESP';
  email: string;
  name?: string | null;
  transactionId: string;
}) {
  if (!env.YOUTUBE_REWARDS_WEBHOOK_URL || !env.YOUTUBE_REWARDS_WEBHOOK_SECRET) return;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-tmxhub-secret': env.YOUTUBE_REWARDS_WEBHOOK_SECRET,
  };
  if (env.YOUTUBE_REWARDS_SITE_BYPASS_TOKEN)
    headers.authorization = `Bearer ${env.YOUTUBE_REWARDS_SITE_BYPASS_TOKEN}`;
  const response = await fetch(env.YOUTUBE_REWARDS_WEBHOOK_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      offer: input.offer,
      status: 'paid',
      email: input.email,
      name: input.name,
      transactionId: input.transactionId,
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok)
    throw new Error(`YouTube Rewards provisioning failed with HTTP ${response.status}`);
}

/**
 * Offers can have an internal traffic/channel suffix while sharing the same
 * members area. Keep that mapping explicit so a new channel cannot silently
 * stop provisioning access.
 */
export function resolveYoutubeRewardsOffer(offerName: string | null): 'PJR_ENG' | 'PJR_ESP' | null {
  switch (offerName?.trim().toUpperCase()) {
    case 'PJR_ENG':
    case 'PJR_ENG_TTK':
      return 'PJR_ENG';
    case 'PJR_ESP':
      return 'PJR_ESP';
    default:
      return null;
  }
}
