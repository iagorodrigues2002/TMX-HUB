import type { FastifyInstance } from 'fastify';

export const saleNoticeScopeKey = (userId: string) => `user-sale-notice-scope:${userId}`;

export async function saleNoticeOffers(
  app: Pick<FastifyInstance, 'redis' | 'offerStore'>,
  user: { sub: string; role: string },
) {
  const admin = user.role === 'admin';
  const offers = await app.offerStore.listAccessible(user.sub, admin);
  const ownOnly = admin && (await app.redis?.get(saleNoticeScopeKey(user.sub))) === 'own';
  return ownOnly ? offers.filter((offer) => offer.userId === user.sub) : offers;
}
