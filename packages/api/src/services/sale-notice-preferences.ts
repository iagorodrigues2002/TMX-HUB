import type { FastifyInstance } from 'fastify';
import { effectiveCompanyTools } from '../lib/company-tools.js';

export const saleNoticeScopeKey = (userId: string) => `user-sale-notice-scope:${userId}`;

type NoticeApp = Pick<FastifyInstance, 'db' | 'redis' | 'offerStore'>;
type NoticeUser = { sub: string; role: string; tools?: string[] };

export async function saleNoticeAccessibleOffers(app: NoticeApp, user: NoticeUser) {
  if (!app.db) throw new Error('notification_database_unavailable');
  const tools = await effectiveCompanyTools(
    app.db,
    user.sub,
    user.role === 'admin' ? 'admin' : 'user',
  );
  if (
    user.role !== 'admin' &&
    ((tools !== undefined && !tools.includes('ofertas')) ||
      (user.tools !== undefined && !user.tools.includes('ofertas')))
  )
    return [];
  return app.offerStore.listAccessible(user.sub, user.role === 'admin');
}

export async function saleNoticeSelection(
  app: NoticeApp,
  user: { sub: string; role: string },
  offers: Awaited<ReturnType<typeof saleNoticeAccessibleOffers>>,
) {
  if (!app.db) throw new Error('notification_database_unavailable');
  const [saved] =
    await app.db`SELECT offer_ids FROM sale_notice_preferences WHERE user_id=${user.sub}`;
  if (saved) return saved.offer_ids as string[];
  // Preserve the legacy opt-out until the user explicitly saves a selection.
  const ownOnly =
    user.role === 'admin' && (await app.redis.get(saleNoticeScopeKey(user.sub))) === 'own';
  return offers.filter((offer) => !ownOnly || offer.userId === user.sub).map((offer) => offer.id);
}

export async function saleNoticeOffers(app: NoticeApp, user: NoticeUser) {
  const offers = await saleNoticeAccessibleOffers(app, user);
  const selected = new Set(await saleNoticeSelection(app, user, offers));
  // Preferences never grant access, including after suspension or revocation.
  return offers.filter((offer) => selected.has(offer.id));
}
