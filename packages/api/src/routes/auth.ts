import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { env } from '../env.js';
import { signJwt } from '../lib/jwt.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { BadRequestError, HttpProblem, zodToProblem } from '../lib/problem.js';

const LoginSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(6),
  })
  .strict();

const RegisterSchema = z
  .object({
    email: z.string().email(),
    name: z.string().min(1).max(100),
    password: z.string().min(8).max(200),
    /**
     * Token de convite (ULID). Quando presente e válido, contorna a checagem
     * ALLOW_REGISTRATION mesmo com registro fechado — admin gera no /settings
     * e compartilha link `/register?invite=TOKEN`.
     */
    invite_token: z.string().min(20).max(40).optional(),
  })
  .strict();

const CreateInviteSchema = z
  .object({
    email: z.string().email().optional(),
    name: z.string().min(1).max(100).optional(),
    /** Validade em dias. Default: 7. Mínimo 1, máximo 30. */
    expires_in_days: z.number().int().min(1).max(30).optional(),
  })
  .strict();

class ForbiddenError extends HttpProblem {
  constructor(detail = 'Operação não permitida.') {
    super({ status: 403, title: 'Forbidden', detail, code: 'forbidden' });
  }
}

class InvalidCredentialsError extends HttpProblem {
  constructor() {
    super({
      status: 401,
      title: 'Invalid credentials',
      detail: 'Email ou senha incorretos.',
      code: 'invalid_credentials',
    });
  }
}

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  // POST /v1/auth/login → { user, token, expires_at }
  app.post('/auth/login', async (req, reply) => {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) throw zodToProblem(parsed.error, req.url);
    const { email, password } = parsed.data;
    const user = await app.userStore.getByEmail(email);
    if (!user) throw new InvalidCredentialsError();
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) throw new InvalidCredentialsError();
    const { token, payload } = signJwt(
      { sub: user.id, email: user.email, role: user.role },
      env.JWT_SECRET,
    );
    return reply.send({
      user: app.userStore.toPublic(user),
      token,
      expires_at: new Date(payload.exp * 1000).toISOString(),
    });
  });

  // POST /v1/auth/register
  // Three-tier policy:
  //   1) First-run bootstrap: if there are zero users yet, the FIRST account
  //      created via the UI becomes admin. Lets you self-onboard without
  //      having to set ADMIN_* env vars.
  //   2) Open: when ALLOW_REGISTRATION=true, anyone can create a user account.
  //   3) Closed (default after first-run): only an authenticated admin can
  //      create new users.
  app.post('/auth/register', async (req, reply) => {
    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) throw zodToProblem(parsed.error, req.url);
    const { email, name, password, invite_token: inviteToken } = parsed.data;

    const userCount = await app.userStore.count();
    const isFirstRun = userCount === 0;
    let creatingAdmin = false;
    let consumedInvite = false;

    if (isFirstRun) {
      // Anybody can claim the first slot, and they become admin.
      creatingAdmin = true;
    } else if (inviteToken) {
      // Tier 2.5: convite válido contorna ALLOW_REGISTRATION.
      const invite = await app.inviteStore.get(inviteToken);
      if (!invite) {
        throw new ForbiddenError('Convite inválido ou expirado.');
      }
      consumedInvite = true;
    } else if (!env.ALLOW_REGISTRATION) {
      // Tier 3: must be authenticated admin.
      try {
        await app.requireAuth(req);
      } catch {
        throw new ForbiddenError(
          'Registro fechado. Solicite um convite a um administrador.',
        );
      }
      if (req.user?.role !== 'admin') {
        throw new ForbiddenError('Apenas admins podem criar usuários nesta instância.');
      }
    }
    // Else: ALLOW_REGISTRATION=true → everyone can self-register as 'user'.

    const passwordHash = await hashPassword(password);
    const created = await app.userStore.create({
      email,
      name,
      passwordHash,
      role: creatingAdmin ? 'admin' : 'user',
    });
    if (consumedInvite && inviteToken) {
      await app.inviteStore.consume(inviteToken).catch(() => {});
    }
    const { token, payload } = signJwt(
      { sub: created.id, email: created.email, role: created.role },
      env.JWT_SECRET,
    );
    return reply.code(201).send({
      user: app.userStore.toPublic(created),
      token,
      expires_at: new Date(payload.exp * 1000).toISOString(),
    });
  });

  // GET /v1/auth/invites/:token — público. Valida convite, retorna metadata
  // (email/name pré-preenchidos), sem nenhum dado sensível.
  app.get<{ Params: { token: string } }>(
    '/auth/invites/:token',
    async (req, reply) => {
      const invite = await app.inviteStore.get(req.params.token);
      if (!invite) {
        return reply.code(404).send({
          valid: false,
          detail: 'Convite inválido ou expirado.',
        });
      }
      return reply.send({
        valid: true,
        email: invite.email,
        name: invite.name,
        expires_at: invite.expiresAt,
        invited_by: invite.createdByName,
      });
    },
  );

  // POST /v1/auth/invites — admin gera novo convite. Retorna token + URL pronta.
  app.post(
    '/auth/invites',
    { preHandler: (req) => app.requireAuth(req) },
    async (req, reply) => {
      if (req.user?.role !== 'admin') {
        throw new ForbiddenError('Apenas admins podem criar convites.');
      }
      const parsed = CreateInviteSchema.safeParse(req.body);
      if (!parsed.success) throw zodToProblem(parsed.error, req.url);
      const days = parsed.data.expires_in_days ?? 7;
      const me = await app.userStore.maybeGetById(req.user.sub);
      const invite = await app.inviteStore.create({
        createdBy: req.user.sub,
        ...(me?.name ? { createdByName: me.name } : {}),
        ...(parsed.data.email ? { email: parsed.data.email } : {}),
        ...(parsed.data.name ? { name: parsed.data.name } : {}),
        expiresInSec: days * 24 * 60 * 60,
      });
      return reply.code(201).send({
        token: invite.token,
        email: invite.email,
        name: invite.name,
        created_at: invite.createdAt,
        expires_at: invite.expiresAt,
        invited_by: invite.createdByName,
      });
    },
  );

  // GET /v1/auth/invites — admin lista convites pendentes.
  app.get(
    '/auth/invites',
    { preHandler: (req) => app.requireAuth(req) },
    async (req, reply) => {
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
        })),
      });
    },
  );

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
  app.get(
    '/auth/me',
    { preHandler: (req) => app.requireAuth(req) },
    async (req, reply) => {
      if (!req.user) throw new BadRequestError('No user attached.');
      const u = await app.userStore.getById(req.user.sub);
      return reply.send({ user: app.userStore.toPublic(u) });
    },
  );
};

export default plugin;
