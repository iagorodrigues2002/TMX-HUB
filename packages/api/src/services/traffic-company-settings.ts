import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { creativeWorkspaceCompany, trafficCompanyKey } from './traffic-server-cache.js';

const text = z.string().max(200);
const asset = z.object({
  id: text, name: text, external: text, bm: text, owner: text, supplier: text,
  status: z.enum(['Ativo', 'Desabilitado']).nullable(),
  metaStatus: z.enum(['Ativo', 'Desabilitado']).nullable(),
  usage: z.enum(['Em uso', 'Em aquecimento', 'Standby']),
  source: z.enum(['demo', 'meta']), relationship: z.enum(['managed', 'shared', 'unknown']).optional(),
});
const schemas = {
  classification: z.object({ campaigns: z.record(text, text), links: z.record(text, text) }),
  inventory: z.object({ bms: z.array(asset).max(10000), accounts: z.array(asset).max(10000) }),
  structure: z.array(z.object({ id: text, name: text, kind: z.enum(['ct', 'profile']), ct: text,
    active: z.boolean(), assets: z.array(text).max(10000) })).max(10000),
};
const section = z.enum(['classification', 'inventory', 'structure']);

export function registerTrafficCompanySettings(app: FastifyInstance) {
  app.get('/meta-control/traffic/settings/:section', async (req, reply) => {
    const kind = section.safeParse((req.params as { section: string }).section);
    if (!kind.success) return reply.code(404).send({ error: 'not_found' });
    const company = await creativeWorkspaceCompany(app.redis, app.db, req.user,
      kind.data === 'classification' ? ['traffic-overview', 'traffic-campaigns', 'traffic-windows', 'ads-intelligence'] : ['traffic-contingency']);
    if (!company) return reply.code(403).send({ detail: 'Empresa não autorizada.' });
    const raw = await app.redis.get(`${trafficCompanyKey(company)}settings:${kind.data}`);
    reply.header('Cache-Control', 'private, no-store');
    return { companyId: company, ...(raw ? JSON.parse(raw) : { revision: '', value: null }) };
  });
  app.put('/meta-control/traffic/settings/:section', { bodyLimit: 2_000_000 }, async (req, reply) => {
    const kind = section.safeParse((req.params as { section: string }).section);
    if (!kind.success) return reply.code(404).send({ error: 'not_found' });
    const company = await creativeWorkspaceCompany(app.redis, app.db, req.user,
      kind.data === 'classification' ? ['traffic-overview', 'traffic-campaigns', 'traffic-windows', 'ads-intelligence'] : ['traffic-contingency']);
    if (!company || req.user?.role !== 'admin')
      return reply.code(403).send({ detail: 'Somente administradores da empresa podem editar.' });
    const input = z.object({ revision: z.string().max(64), value: schemas[kind.data] }).safeParse(req.body);
    if (!input.success) return reply.code(400).send({ detail: 'Configuração inválida.' });
    const saved = { revision: randomUUID(), value: input.data.value };
    const ok = await app.redis.eval(
      "local raw=redis.call('GET',KEYS[1]);local revision='';if raw then revision=cjson.decode(raw).revision end;if revision~=ARGV[1] then return 0 end;redis.call('SET',KEYS[1],ARGV[2]);return 1",
      1, `${trafficCompanyKey(company)}settings:${kind.data}`, input.data.revision, JSON.stringify(saved),
    );
    if (ok !== 1) return reply.code(409).send({ detail: 'Outro usuário atualizou estes dados. Atualize e tente novamente.' });
    return { companyId: company, ...saved };
  });
}
