import type { FastifyInstance } from 'fastify';
import { BadRequestError } from '../../lib/problem.js';
import { ForbiddenError } from './send-invite-email.js';

export function registerGetAuthInvitesRoutes(app: FastifyInstance) {
  // GET /v1/auth/invites — admin lista convites pendentes.
  app.get('/auth/invites', { preHandler: (req) => app.requireAuth(req) }, async (req, reply) => {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenError('Apenas admins podem listar convites.');
    }
    const invites = await app.inviteStore.listActive();
    return reply.send({
      invites: invites.map((i) => ({
        token: i.token,
        email: i.email,
        name: i.name,
        created_at: i.createdAt,
        expires_at: i.expiresAt,
        invited_by: i.createdByName,
        allowed_tools: i.allowedTools,
      })),
    });
  });

  // DELETE /v1/auth/invites/:token — admin revoga convite.
  app.delete<{ Params: { token: string } }>(
    '/auth/invites/:token',
    { preHandler: (req) => app.requireAuth(req) },
    async (req, reply) => {
      if (req.user?.role !== 'admin') {
        throw new ForbiddenError('Apenas admins podem revogar convites.');
      }
      await app.inviteStore.revoke(req.params.token);
      return reply.code(204).send();
    },
  );

  // GET /v1/auth/me — protected
  app.get('/auth/me', { preHandler: (req) => app.requireAuth(req) }, async (req, reply) => {
    if (!req.user) throw new BadRequestError('No user attached.');
    const u = await app.userStore.getById(req.user.sub);
    return reply.send({ user: app.userStore.toPublic(u) });
  });
}
