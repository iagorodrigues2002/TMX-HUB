import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ulid } from 'ulid';
import { env } from '../env.js';
import { PushcutProfileSchema } from '../integrations/pushcut/policy.js';
import { filterCompanyNavigationOffers } from '../lib/company-navigation-access.js';
import { HttpProblem, NotFoundError } from '../lib/problem.js';
import { decryptSecret, encryptSecret } from '../lib/secret-box.js';

export function registerPushcutProfiles(app: FastifyInstance) {
  const path = '/offers/:id/tracking/pushcut-profiles';
  app.get<{ Params: { id: string } }>(path, async (req, reply) => {
    await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
    if (!app.db) return reply.code(503).send({ error: 'tracking_database_unavailable' });
    const profiles = await app.db`
      SELECT p.id,p.name,p.front_notification_name,p.upsell_notification_name,p.devices,
             p.order_kinds,p.show_amount,p.enabled,
             ARRAY(SELECT tp.offer_id FROM tracking_pushcut_destinations d
               JOIN tracking_projects tp ON tp.id=d.project_id
               WHERE d.profile_id=p.id AND d.profile_selected) AS offer_ids
      FROM tracking_pushcut_profiles p WHERE p.owner_user_id=${req.user!.sub}
      ORDER BY p.created_at DESC
    `;
    const offers = await filterCompanyNavigationOffers(
      app.db,
      req.user!,
      await app.offerStore.listAccessible(req.user!.sub, req.user!.role === 'admin'),
      path,
    );
    const manageable = [];
    for (const offer of offers) {
      try {
        await app.offerStore.assertManager(offer.id, req.user!.sub, req.user!.role === 'admin');
        manageable.push({ id: offer.id, name: offer.name });
      } catch (error) {
        if (!(error instanceof NotFoundError)) throw error;
      }
    }
    const allowed = new Set(manageable.map((offer) => offer.id));
    return {
      profiles: profiles.map((p) => ({
        ...p,
        offer_ids: (p.offer_ids as string[]).filter((id) => allowed.has(id)),
      })),
      offers: manageable,
    };
  });

  app.post<{ Params: { id: string; profileId?: string } }>(path, save);
  app.patch<{ Params: { id: string; profileId?: string } }>(`${path}/:profileId`, save);

  async function save(req: FastifyRequest, reply: FastifyReply) {
    const { id: offerId, profileId } = req.params as { id: string; profileId?: string };
    await app.offerStore.assertManager(offerId, req.user!.sub, req.user!.role === 'admin');
    if (!app.db || !env.TRACKING_ENCRYPTION_KEY)
      return reply.code(503).send({ error: 'tracking_encryption_unavailable' });
    const parsed = PushcutProfileSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_pushcut_profile' });
    const body = parsed.data;
    if (profileId && body.source_destination_id)
      return reply.code(400).send({ error: 'invalid_pushcut_profile' });
    for (const id of body.offer_ids)
      await app.offerStore.assertManager(id, req.user!.sub, req.user!.role === 'admin');
    const permitted = await filterCompanyNavigationOffers(
      app.db,
      req.user!,
      body.offer_ids.map((id) => ({ id })),
      path,
    );
    if (permitted.length !== body.offer_ids.length)
      throw new HttpProblem({ status: 403, title: 'Forbidden', code: 'company_section_forbidden' });
    const result = await app.db.begin(async (tx) => {
      const [existing] = profileId
        ? await tx`
        SELECT * FROM tracking_pushcut_profiles WHERE id=${profileId} AND owner_user_id=${req.user!.sub} FOR UPDATE
      `
        : [];
      if (profileId && !existing) return { status: 404, error: 'profile_not_found' };
      const [source] = body.source_destination_id
        ? await tx`
        SELECT d.id,d.secret_encrypted FROM tracking_pushcut_destinations d
        JOIN tracking_projects tp ON tp.id=d.project_id
        WHERE d.id=${body.source_destination_id} AND tp.offer_id=${offerId} AND d.profile_id IS NULL FOR UPDATE OF d
      `
        : [];
      if (body.source_destination_id && !source)
        return { status: 409, error: 'destination_not_available' };
      const secret = body.secret
        ? encryptSecret(body.secret, env.TRACKING_ENCRYPTION_KEY!)
        : (existing?.secret_encrypted ?? source?.secret_encrypted);
      if (!secret) return { status: 400, error: 'pushcut_secret_required' };
      const projects = body.offer_ids.length
        ? await tx`SELECT id,offer_id FROM tracking_projects WHERE offer_id=ANY(${body.offer_ids}::text[])`
        : [];
      if (projects.length !== body.offer_ids.length)
        return { status: 409, error: 'tracking_not_configured' };
      const id = profileId ?? ulid();
      await tx`
        INSERT INTO tracking_pushcut_profiles
          (id,owner_user_id,name,secret_encrypted,front_notification_name,upsell_notification_name,devices,order_kinds,show_amount,enabled)
        VALUES (${id},${req.user!.sub},${body.name},${secret},${body.front_notification_name},${body.upsell_notification_name},${tx.json(body.devices)},${body.order_kinds},${body.show_amount},${body.enabled})
        ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,secret_encrypted=EXCLUDED.secret_encrypted,
          front_notification_name=EXCLUDED.front_notification_name,upsell_notification_name=EXCLUDED.upsell_notification_name,
          devices=EXCLUDED.devices,order_kinds=EXCLUDED.order_kinds,show_amount=EXCLUDED.show_amount,enabled=EXCLUDED.enabled,updated_at=now()
      `;
      if (source)
        await tx`UPDATE tracking_pushcut_destinations SET profile_id=${id} WHERE id=${source.id}`;
      if (source && projects.length) {
        const legacy =
          await tx`SELECT id,secret_encrypted,devices FROM tracking_pushcut_destinations WHERE profile_id IS NULL AND enabled AND project_id=ANY(${projects.map((p) => p.id)}::text[]) FOR UPDATE`;
        const credential = decryptSecret(secret, env.TRACKING_ENCRYPTION_KEY!);
        for (const destination of legacy) {
          if (
            decryptSecret(destination.secret_encrypted, env.TRACKING_ENCRYPTION_KEY!) ===
              credential &&
            JSON.stringify([...destination.devices].sort()) ===
              JSON.stringify([...body.devices].sort())
          ) {
            await tx`UPDATE tracking_pushcut_destinations SET enabled=false,updated_at=now() WHERE id=${destination.id}`;
          }
        }
      }
      // Keep delivery history and stable destination IDs; unselected offers stop sending.
      await tx`UPDATE tracking_pushcut_destinations SET enabled=false,profile_selected=false,updated_at=now() WHERE profile_id=${id}`;
      for (const project of projects)
        await tx`
        INSERT INTO tracking_pushcut_destinations
          (id,project_id,profile_id,name,secret_encrypted,front_notification_name,upsell_notification_name,devices,order_kinds,show_amount,enabled)
        VALUES (${ulid()},${project.id},${id},${body.name},${secret},${body.front_notification_name},${body.upsell_notification_name},${tx.json(body.devices)},${body.order_kinds},${body.show_amount},${body.enabled})
        ON CONFLICT(profile_id,project_id) DO UPDATE SET name=EXCLUDED.name,secret_encrypted=EXCLUDED.secret_encrypted,
          front_notification_name=EXCLUDED.front_notification_name,upsell_notification_name=EXCLUDED.upsell_notification_name,
          devices=EXCLUDED.devices,order_kinds=EXCLUDED.order_kinds,show_amount=EXCLUDED.show_amount,enabled=EXCLUDED.enabled,profile_selected=true,updated_at=now()
      `;
      return { status: 200, id };
    });
    return reply
      .code(result.status)
      .send('error' in result ? { error: result.error } : { profile: { id: result.id } });
  }
}
