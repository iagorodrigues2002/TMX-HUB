import { createHash, randomBytes } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { ulid } from 'ulid';
import { z } from 'zod';
import { env } from '../env.js';
import { BadRequestError, NotFoundError } from '../lib/problem.js';
import { decryptSecret, encryptSecret } from '../lib/secret-box.js';

export const syzeHash = (value: string | Buffer) =>
  createHash('sha256').update(value).digest('hex');
export const syzeCompanyKey = (owner: string, company: string) =>
  syzeHash(`${owner}\0${company.trim().toLocaleLowerCase('pt-BR')}`);

// Raw bytes are retained encrypted until we know the vendor contract. No parser,
// guessed signature verification, order normalization or downstream queues here.
export const syzepayPublicRoutes: FastifyPluginAsync<{
  receive?: (
    tokenHash: string,
    body: Buffer,
    contentType: string,
    headers: Record<string, string>,
  ) => Promise<{ id: string; attempts: number } | null>;
}> = async (app, options) => {
  app.removeAllContentTypeParsers();
  app.addContentTypeParser('*', { parseAs: 'buffer' }, (_req, body, done) => done(null, body));
  app.post<{ Querystring: { token?: string } }>(
    '/webhooks/syzepay',
    {
      bodyLimit: 262144,
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      reply.header('Cache-Control', 'no-store');
      const token = req.query.token;
      if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token))
        return reply.code(401).send({ error: 'invalid_token' });
      const body = req.body as Buffer;
      if (!Buffer.isBuffer(body) || !body.length)
        return reply.code(400).send({ error: 'empty_body' });
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(req.headers)) {
        if (/signature|^x-.*(?:event|delivery|timestamp)/i.test(key) && typeof value === 'string')
          headers[key] = value.slice(0, 4096);
      }
      const contentType = String(req.headers['content-type'] ?? 'application/octet-stream').slice(
        0,
        256,
      );
      let receipt;
      try {
        if (options.receive)
          receipt = await options.receive(syzeHash(token), body, contentType, headers);
        else {
          if (!app.db || !env.TRACKING_ENCRYPTION_KEY)
            return reply.code(503).send({ error: 'inbox_unavailable' });
          const secret = env.TRACKING_ENCRYPTION_KEY;
          receipt = await app.db.begin(async (sql) => {
            await sql`SET LOCAL statement_timeout='2500ms'`;
            const [connection] = await sql<
              { id: string }[]
            >`SELECT id FROM syzepay_company_connections WHERE token_hash=${syzeHash(token)} AND enabled`;
            if (!connection) return null;
            const [row] = await sql<{ id: string; attempts: number }[]>`
            INSERT INTO syzepay_inbox_receipts(id,connection_id,body_hash,body_encrypted,headers_encrypted,content_type,body_bytes)
            VALUES(${ulid()},${connection.id},${syzeHash(body)},${encryptSecret(body.toString('base64'), secret)},${encryptSecret(JSON.stringify(headers), secret)},${contentType},${body.length})
            ON CONFLICT(connection_id,body_hash) DO UPDATE SET attempts=syzepay_inbox_receipts.attempts+1,last_received_at=now()
            RETURNING id,attempts`;
            return row;
          });
        }
      } catch {
        return reply.code(503).send({ error: 'inbox_unavailable' });
      }
      if (!receipt) return reply.code(401).send({ error: 'invalid_token' });
      return reply.code(202).send({
        received: true,
        receipt_id: receipt.id,
        state: 'awaiting_mapping',
        duplicate: receipt.attempts > 1,
      });
    },
  );
};

const createSchema = z
  .object({
    company_key: z.string().regex(/^[a-f0-9]{64}$/),
    name: z.string().trim().min(2).max(100),
  })
  .strict();
export const syzepayAdminRoutes: FastifyPluginAsync = async (app) => {
  const companies = async (owner: string) => {
    const offers = (await app.offerStore.listByUser(owner)).filter(
      (o) => o.userId === owner && o.companyName?.trim(),
    );
    const groups = new Map<string, { key: string; name: string; offers: number }>();
    for (const offer of offers) {
      const name = offer.companyName!.trim();
      const key = syzeCompanyKey(owner, name);
      const group = groups.get(key) ?? { key, name, offers: 0 };
      group.offers++;
      groups.set(key, group);
    }
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  };
  app.get('/tracking/syzepay/companies', async (req, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    return { companies: await companies(req.user!.sub) };
  });
  app.get('/tracking/syzepay/connections', async (req, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    if (!app.db) return reply.code(503).send({ error: 'database_unavailable' });
    const connections = await app.db`
      SELECT c.id,c.company_key,c.company_name,c.name,c.enabled,c.created_at,
        (SELECT count(*)::int FROM syzepay_inbox_receipts r WHERE r.connection_id=c.id) AS receipts,
        (SELECT max(received_at) FROM syzepay_inbox_receipts r WHERE r.connection_id=c.id) AS last_received_at
      FROM syzepay_company_connections c WHERE c.owner_id=${req.user!.sub} ORDER BY c.created_at DESC`;
    return { connections };
  });
  app.post('/tracking/syzepay/connections', async (req, reply) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError('Informe empresa e nome da conexão.');
    const company = (await companies(req.user!.sub)).find((c) => c.key === parsed.data.company_key);
    if (!company)
      throw new NotFoundError(
        'Empresa própria não encontrada. Acesso como convidado não autoriza gateway global.',
      );
    if (!app.db || !env.TRACKING_ENCRYPTION_KEY)
      return reply.code(503).send({ error: 'inbox_unavailable' });
    const token = randomBytes(32).toString('base64url');
    const [row] = await app.db`
      INSERT INTO syzepay_company_connections(id,owner_id,company_key,company_name,name,token_hash,token_encrypted)
      VALUES(${ulid()},${req.user!.sub},${company.key},${company.name},${parsed.data.name},${syzeHash(token)},${encryptSecret(token, env.TRACKING_ENCRYPTION_KEY)})
      ON CONFLICT(owner_id,company_key,name) DO NOTHING RETURNING id`;
    if (!row)
      return reply.code(409).send({ detail: 'Já existe uma conexão com esse nome nesta empresa.' });
    return reply.code(201).send({
      id: row.id,
      webhook_url: `${env.TRACKING_PUBLIC_BASE_URL.replace(/\/$/, '')}/v1/webhooks/syzepay?token=${token}`,
    });
  });
  app.get<{ Params: { id: string } }>(
    '/tracking/syzepay/connections/:id/url',
    async (req, reply) => {
      reply.header('Cache-Control', 'private, no-store');
      if (!app.db || !env.TRACKING_ENCRYPTION_KEY)
        return reply.code(503).send({ error: 'inbox_unavailable' });
      const [row] = await app.db<
        { token_encrypted: string }[]
      >`SELECT token_encrypted FROM syzepay_company_connections WHERE id=${req.params.id} AND owner_id=${req.user!.sub}`;
      if (!row) throw new NotFoundError();
      const token = decryptSecret(row.token_encrypted, env.TRACKING_ENCRYPTION_KEY);
      return {
        webhook_url: `${env.TRACKING_PUBLIC_BASE_URL.replace(/\/$/, '')}/v1/webhooks/syzepay?token=${token}`,
      };
    },
  );
  app.patch<{ Params: { id: string } }>('/tracking/syzepay/connections/:id', async (req, reply) => {
    const parsed = z.object({ enabled: z.boolean() }).strict().safeParse(req.body);
    if (!parsed.success) throw new BadRequestError('Informe o estado da recepção.');
    if (!app.db) return reply.code(503).send({ error: 'database_unavailable' });
    const [row] = await app.db`UPDATE syzepay_company_connections SET enabled=${parsed.data.enabled}
      WHERE id=${req.params.id} AND owner_id=${req.user!.sub} RETURNING id,enabled`;
    if (!row) throw new NotFoundError();
    return row;
  });
  app.get<{ Params: { id: string } }>(
    '/tracking/syzepay/connections/:id/receipts',
    async (req, reply) => {
      reply.header('Cache-Control', 'private, no-store');
      if (!app.db) return reply.code(503).send({ error: 'database_unavailable' });
      const [connection] =
        await app.db`SELECT id FROM syzepay_company_connections WHERE id=${req.params.id} AND owner_id=${req.user!.sub}`;
      if (!connection) throw new NotFoundError();
      return {
        receipts:
          await app.db`SELECT id,received_at,last_received_at,attempts,content_type,body_bytes,state,authenticity FROM syzepay_inbox_receipts WHERE connection_id=${req.params.id} ORDER BY received_at DESC LIMIT 50`,
      };
    },
  );
};
