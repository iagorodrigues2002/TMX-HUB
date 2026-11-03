import { randomUUID } from 'node:crypto';
import { ALL_TOOL_KEYS } from '@page-cloner/shared';
import type { FastifyPluginAsync } from 'fastify';
import type { Sql, TransactionSql } from 'postgres';
import { z } from 'zod';
import { env } from '../env.js';
import { BadRequestError, ConflictError, HttpProblem, NotFoundError } from '../lib/problem.js';
import { decryptSecret, encryptSecret } from '../lib/secret-box.js';
import { compensationMonthSchema, compensationSchema } from '../services/company-compensation.js';
import {
  readCompanyCompensation,
  registerCompanyCompensation,
  saveCompanyCompensation,
} from './company-compensation.js';
import { registerCompanyFinance } from './company-finance.js';

const idSchema = z.string().uuid();
const accessSchema = z
  .object({
    role: z.enum(['owner', 'admin', 'member']),
    status: z.enum(['active', 'suspended']),
    tools: z
      .array(z.string().refine((tool) => ALL_TOOL_KEYS.includes(tool as never)))
      .max(ALL_TOOL_KEYS.length),
    all_offers: z.boolean(),
    offer_ids: z.array(z.string().min(1).max(100)).max(500),
  })
  .strict();
const denied = () =>
  new HttpProblem({ status: 403, title: 'Forbidden', detail: 'Acesso empresarial não permitido.' });
function pixEncryptionKey() {
  if (!env.TRACKING_ENCRYPTION_KEY) throw new HttpProblem({ status: 503, title: 'Unavailable' });
  return env.TRACKING_ENCRYPTION_KEY;
}

// Lock the company before any membership mutation so simultaneous owner changes serialize.
async function manager(sql: Sql | TransactionSql, company: string, user: string, lock = false) {
  if (lock) await sql`SELECT id FROM companies WHERE id=${company} FOR UPDATE`;
  const [actor] =
    await sql`SELECT role FROM company_memberships WHERE company_id=${company} AND user_id=${user} AND status='active'`;
  if (!actor || !['owner', 'admin'].includes(actor.role)) throw denied();
  return actor.role as 'owner' | 'admin';
}

export const companyRoutes: FastifyPluginAsync = async (app) => {
  registerCompanyCompensation(app, manager);
  registerCompanyFinance(app, manager);
  app.addHook('preHandler', async (_req, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    if (!app.db) throw new HttpProblem({ status: 503, title: 'Unavailable' });
  });
  app.get('/companies', async (req) => ({
    companies: await app.db!`
    SELECT c.id,c.name,m.role FROM companies c JOIN company_memberships m ON m.company_id=c.id
    WHERE m.user_id=${req.user!.sub} AND m.status='active' ORDER BY c.name,c.id`,
  }));
  app.get<{ Params: { id: string } }>('/companies/:id/payees', async (req) => {
    const id = idSchema.parse(req.params.id);
    await manager(app.db!, id, req.user!.sub);
    const rows = await app.db!`SELECT m.user_id,m.status,p.key_encrypted FROM company_memberships m
      LEFT JOIN company_member_pix p ON p.company_id=m.company_id AND p.user_id=m.user_id
      WHERE m.company_id=${id} ORDER BY m.user_id`;
    return {
      payees: await Promise.all(
        rows.map(async (row) => ({
          user_id: row.user_id,
          name: (await app.userStore.maybeGetById(row.user_id))?.name ?? 'Usuário indisponível',
          status: row.status,
          pix: row.key_encrypted
            ? JSON.parse(decryptSecret(row.key_encrypted, pixEncryptionKey()))
            : null,
        })),
      ),
    };
  });
  app.put<{ Params: { id: string; userId: string } }>(
    '/companies/:id/payees/:userId',
    async (req) => {
      const id = idSchema.parse(req.params.id);
      const input = z
        .object({
          pix: z
            .object({
              type: z.enum(['cpf', 'cnpj', 'email', 'phone', 'random']),
              value: z.string().trim().min(1).max(254),
            })
            .strict()
            .nullable(),
          compensation: z
            .object({ month: compensationMonthSchema, settings: compensationSchema })
            .strict()
            .optional(),
        })
        .strict()
        .parse(req.body);
      const compensation = await app.db!.begin(async (sql) => {
        await manager(sql, id, req.user!.sub, true);
        const [member] =
          await sql`SELECT user_id FROM company_memberships WHERE company_id=${id} AND user_id=${req.params.userId}`;
        if (!member) throw new NotFoundError();
        if (input.pix) {
          const { type, value } = input.pix;
          const valid =
            type === 'email'
              ? z.string().email().safeParse(value).success
              : type === 'random'
                ? z.string().uuid().safeParse(value).success
                : type === 'cpf'
                  ? /^\d{11}$/.test(value)
                  : type === 'cnpj'
                    ? /^\d{14}$/.test(value)
                    : /^\+[1-9]\d{7,14}$/.test(value);
          if (!valid) throw new BadRequestError('Formato de chave Pix inválido.');
          const encrypted = encryptSecret(JSON.stringify(input.pix), pixEncryptionKey());
          await sql`INSERT INTO company_member_pix(company_id,user_id,key_encrypted) VALUES(${id},${req.params.userId},${encrypted})
          ON CONFLICT(company_id,user_id) DO UPDATE SET key_encrypted=EXCLUDED.key_encrypted,updated_at=now()`;
        } else {
          await sql`DELETE FROM company_member_pix WHERE company_id=${id} AND user_id=${req.params.userId}`;
        }
        await sql`INSERT INTO company_access_audit(company_id,actor_id,action,subject_id) VALUES(${id},${req.user!.sub},${input.pix ? 'pix.updated' : 'pix.removed'},${req.params.userId})`;
        if (input.compensation) {
          await saveCompanyCompensation(
            sql,
            id,
            req.params.userId,
            input.compensation.month,
            input.compensation.settings,
            req.user!.sub,
          );
          // Calculate before commit: a failed report must not leave a partially saved form.
          return readCompanyCompensation(sql, id, req.params.userId, input.compensation.month);
        }
      });
      return { saved: true, ...(compensation ? { compensation } : {}) };
    },
  );
  app.post('/companies', async (req, reply) => {
    if (
      req.user!.tools &&
      !ALL_TOOL_KEYS.filter((tool) => !tool.startsWith('nav:')).every((tool) =>
        req.user!.tools!.includes(tool),
      )
    )
      throw denied();
    const input = z
      .object({ name: z.string().trim().min(1).max(120) })
      .strict()
      .parse(req.body);
    const id = randomUUID();
    await app.db!.begin(async (sql) => {
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${req.user!.sub},0))`;
      const memberships =
        await sql`SELECT role,status FROM company_memberships WHERE user_id=${req.user!.sub}`;
      if (
        req.user!.role !== 'admin' &&
        memberships.length &&
        !memberships.some((row) => row.role === 'owner' && row.status === 'active')
      )
        throw denied();
      await sql`INSERT INTO companies(id,name,created_by) VALUES(${id},${input.name},${req.user!.sub})`;
      await sql`INSERT INTO company_memberships(company_id,user_id,role,tools,all_offers) VALUES(${id},${req.user!.sub},'owner',${ALL_TOOL_KEYS},true)`;
      await sql`INSERT INTO company_access_audit(company_id,actor_id,action,subject_id) VALUES(${id},${req.user!.sub},'company.created',${id})`;
    });
    return reply.code(201).send({ company: { id, name: input.name } });
  });
  app.get<{ Params: { id: string } }>('/companies/:id/members', async (req) => {
    const id = idSchema.parse(req.params.id);
    await manager(app.db!, id, req.user!.sub);
    const rows =
      await app.db!`SELECT m.*,COALESCE((SELECT json_agg(g.offer_id ORDER BY g.offer_id) FROM company_offer_grants g WHERE g.company_id=m.company_id AND g.user_id=m.user_id),'[]'::json) AS offer_ids FROM company_memberships m WHERE m.company_id=${id} ORDER BY m.user_id`;
    const members = await Promise.all(
      rows.map(async (row) => {
        const user = await app.userStore.maybeGetById(row.user_id);
        return {
          ...row,
          name: user?.name ?? 'Usuário indisponível',
          email: user?.email ?? null,
          platform_role: user?.role ?? null,
        };
      }),
    );
    return { members };
  });
  async function save(
    company: string,
    actorId: string,
    userId: string,
    input: z.infer<typeof accessSchema>,
  ) {
    await app.db!.begin(async (sql) => {
      const actorRole = await manager(sql, company, actorId, true);
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${userId},0))`;
      const [existing] =
        await sql`SELECT role FROM company_memberships WHERE company_id=${company} AND user_id=${userId}`;
      if (
        actorRole !== 'owner' &&
        (input.role !== 'member' || existing?.role === 'owner' || existing?.role === 'admin')
      )
        throw denied();
      if (existing?.role === 'owner' && (input.role !== 'owner' || input.status !== 'active')) {
        const [count] =
          await sql`SELECT count(*)::int AS n FROM company_memberships WHERE company_id=${company} AND role='owner' AND status='active' AND user_id<>${userId}`;
        if (!count?.n) throw new ConflictError('A empresa precisa manter um proprietário ativo.');
      }
      const allowed = await sql`SELECT offer_id FROM company_offers WHERE company_id=${company}`;
      const ids = new Set(allowed.map((row) => row.offer_id));
      if (input.offer_ids.some((id) => !ids.has(id)))
        throw new BadRequestError('Oferta não pertence à empresa.');
      await sql`INSERT INTO company_memberships(company_id,user_id,role,status,tools,all_offers)
        VALUES(${company},${userId},${input.role},${input.status},${input.tools},${input.all_offers})
        ON CONFLICT(company_id,user_id) DO UPDATE SET role=EXCLUDED.role,status=EXCLUDED.status,tools=EXCLUDED.tools,all_offers=EXCLUDED.all_offers,updated_at=now()`;
      await sql`DELETE FROM company_offer_grants WHERE company_id=${company} AND user_id=${userId}`;
      for (const offer of new Set(input.offer_ids))
        await sql`INSERT INTO company_offer_grants(company_id,user_id,offer_id) VALUES(${company},${userId},${offer})`;
      await sql`INSERT INTO company_access_audit(company_id,actor_id,action,subject_id) VALUES(${company},${actorId},'membership.updated',${userId})`;
    });
  }
  app.put<{ Params: { id: string; userId: string } }>(
    '/companies/:id/members/:userId',
    async (req) => {
      const id = idSchema.parse(req.params.id);
      await manager(app.db!, id, req.user!.sub);
      if (!(await app.userStore.maybeGetById(req.params.userId))) throw new NotFoundError();
      await save(id, req.user!.sub, req.params.userId, accessSchema.parse(req.body));
      return { saved: true };
    },
  );
  app.post<{ Params: { id: string } }>('/companies/:id/members', async (req, reply) => {
    const id = idSchema.parse(req.params.id);
    await manager(app.db!, id, req.user!.sub);
    const input = accessSchema
      .omit({ status: true })
      .extend({ email: z.string().email().max(254), role: z.enum(['admin', 'member']) })
      .strict()
      .parse(req.body);
    const user = await app.userStore.getByEmail(input.email.trim().toLowerCase());
    if (!user) throw new NotFoundError('Não foi possível vincular esse usuário.');
    await save(id, req.user!.sub, user.id, { ...input, status: 'active' });
    return reply.code(201).send({ saved: true, user_id: user.id });
  });
  app.get<{ Params: { id: string } }>('/companies/:id/offers', async (req) => {
    const id = idSchema.parse(req.params.id);
    await manager(app.db!, id, req.user!.sub);
    const rows = await app.db!`SELECT offer_id FROM company_offers WHERE company_id=${id}`;
    const offers = await Promise.all(
      rows.map(async (row) => {
        try {
          const offer = await app.offerStore.get(row.offer_id);
          return { id: offer.id, name: offer.name };
        } catch (error) {
          if (error instanceof NotFoundError) return null;
          throw error;
        }
      }),
    );
    return { offers: offers.filter((offer) => offer !== null) };
  });
  app.post<{ Params: { id: string } }>('/companies/:id/offers', async (req, reply) => {
    const id = idSchema.parse(req.params.id);
    const { offer_id } = z
      .object({ offer_id: z.string().min(1).max(100) })
      .strict()
      .parse(req.body);
    const offer = await app.offerStore.get(offer_id);
    // Existing ownership is the only authority for migrating an offer, never a company label.
    if (offer.userId !== req.user!.sub) throw denied();
    await app.db!.begin(async (sql) => {
      if ((await manager(sql, id, req.user!.sub, true)) !== 'owner') throw denied();
      const [existing] =
        await sql`SELECT company_id FROM company_offers WHERE offer_id=${offer_id}`;
      if (existing && existing.company_id !== id)
        throw new ConflictError('Oferta já vinculada a outra empresa.');
      await sql`INSERT INTO company_offers(company_id,offer_id,owner_user_id) VALUES(${id},${offer_id},${offer.userId}) ON CONFLICT(offer_id) DO NOTHING`;
      await sql`INSERT INTO company_access_audit(company_id,actor_id,action,subject_id) VALUES(${id},${req.user!.sub},'offer.linked',${offer_id})`;
    });
    return reply.code(201).send({ saved: true });
  });
};
