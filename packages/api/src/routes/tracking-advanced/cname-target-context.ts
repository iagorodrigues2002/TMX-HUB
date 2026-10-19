import type { FastifyInstance } from 'fastify';
import { env } from '../../env.js';

export function createCnameTargetContext(app: FastifyInstance) {
  const cnameTarget = new URL(env.PUBLIC_BASE_URL).hostname;

  const redirectUrl = (testId: string) =>
    `${env.TRACKING_PUBLIC_BASE_URL.replace(/\/$/, '')}/v1/link/${testId}`;

  const entryUrl = (slug: string) =>
    `${env.TRACKING_PUBLIC_BASE_URL.replace(/\/$/, '')}/v1/c/${slug}`;

  const upsellUrl = (slug: string) =>
    `${env.TRACKING_PUBLIC_BASE_URL.replace(/\/$/, '')}/v1/u/${slug}`;

  async function project(offerId: string, userId: string, admin: boolean, manage = false) {
    if (manage) await app.offerStore.assertTrackingManager(offerId, userId, admin);
    else await app.offerStore.assertAccess(offerId, userId, admin);
    if (!app.db) return null;
    const rows = await app.db<Array<{ id: string; public_key: string }>>`
      SELECT id, public_key FROM tracking_projects WHERE offer_id = ${offerId}
    `;
    return rows[0] ?? undefined;
  }
  return { cnameTarget, redirectUrl, entryUrl, upsellUrl, project };
}
