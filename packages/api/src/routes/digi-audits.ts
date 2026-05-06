import {
  CreateDigiAuditRequestSchema,
  UpdateDigiAuditRequestSchema,
} from '@page-cloner/shared';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { BadRequestError, zodToProblem } from '../lib/problem.js';
import type { DigiAudit } from '@page-cloner/shared';

function toWire(a: DigiAudit): Record<string, unknown> {
  return {
    id: a.id,
    product_name: a.productName,
    offer_id: a.offerId,
    status: a.status,
    items: a.items,
    notes: a.notes,
    created_at: a.createdAt,
    updated_at: a.updatedAt,
  };
}

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  // GET /v1/digi-audits — list
  app.get('/digi-audits', async (req, reply) => {
    if (!req.user) throw new BadRequestError('No user attached.');
    const audits = await app.digiAuditStore.listByUser(req.user.sub);
    return reply.send({ audits: audits.map(toWire) });
  });

  // POST /v1/digi-audits
  app.post('/digi-audits', async (req, reply) => {
    if (!req.user) throw new BadRequestError('No user attached.');
    const parsed = CreateDigiAuditRequestSchema.safeParse(req.body);
    if (!parsed.success) throw zodToProblem(parsed.error, req.url);
    const audit = await app.digiAuditStore.create({
      userId: req.user.sub,
      productName: parsed.data.product_name,
      ...(parsed.data.offer_id ? { offerId: parsed.data.offer_id } : {}),
    });
    return reply.code(201).send(toWire(audit));
  });

  // GET /v1/digi-audits/:id
  app.get<{ Params: { id: string } }>('/digi-audits/:id', async (req, reply) => {
    if (!req.user) throw new BadRequestError('No user attached.');
    const audit = await app.digiAuditStore.assertOwner(req.params.id, req.user.sub);
    return reply.send(toWire(audit));
  });

  // PATCH /v1/digi-audits/:id
  app.patch<{ Params: { id: string } }>('/digi-audits/:id', async (req, reply) => {
    if (!req.user) throw new BadRequestError('No user attached.');
    const parsed = UpdateDigiAuditRequestSchema.safeParse(req.body);
    if (!parsed.success) throw zodToProblem(parsed.error, req.url);
    const updated = await app.digiAuditStore.update(req.params.id, req.user.sub, parsed.data);
    return reply.send(toWire(updated));
  });

  // DELETE /v1/digi-audits/:id
  app.delete<{ Params: { id: string } }>('/digi-audits/:id', async (req, reply) => {
    if (!req.user) throw new BadRequestError('No user attached.');
    await app.digiAuditStore.delete(req.params.id, req.user.sub);
    return reply.code(204).send();
  });
};

export default plugin;
