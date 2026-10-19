import type { FastifyInstance } from 'fastify';
import { ConsentRecordSchema } from './request-schemas.js';

export function registerPostConsentRecordRoutes(app: FastifyInstance) {
  app.post('/consent/record', { bodyLimit: 16 * 1024 }, async (req, reply) => {
    if (!app.db) return reply.code(503).send({ recorded: false });
    const parsed = ConsentRecordSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ recorded: false });
    const input = parsed.data;
    const [project] = await app.db<{ id: string }[]>`
      SELECT id FROM tracking_projects
      WHERE public_key=${input.public_key} AND enabled=true
      LIMIT 1
    `;
    if (!project) return reply.code(404).send({ recorded: false });
    const consentedAt = input.client_at ? new Date(input.client_at) : new Date();
    await app.db`
      INSERT INTO tracking_consents
        (project_id,visitor_id,state,consent_version,purposes,consented_at)
      VALUES
        (${project.id},${input.visitor_id},${input.consent},${input.version},${input.purposes},${consentedAt})
      ON CONFLICT(project_id,visitor_id) DO UPDATE SET
        state=excluded.state,
        consent_version=excluded.consent_version,
        purposes=excluded.purposes,
        consented_at=excluded.consented_at,
        updated_at=now()
    `;
    return reply.send({ recorded: true, consent: input.consent });
  });
}
