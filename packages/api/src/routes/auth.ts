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

  // POST /v1/auth/register — gated by ALLOW_REGISTRATION env or admin caller.
  app.post('/auth/register', async (req, reply) => {
    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) throw zodToProblem(parsed.error, req.url);
    const { email, name, password } = parsed.data;

    // If registration is closed, only an admin can create users.
    if (!env.ALLOW_REGISTRATION) {
      // Try to authenticate the caller as admin.
      try {
        await app.requireAuth(req);
      } catch {
        throw new ForbiddenError(
          'Registro fechado. Solicite acesso a um administrador.',
        );
      }
      if (req.user?.role !== 'admin') {
        throw new ForbiddenError('Apenas admins podem criar usuários nesta instância.');
      }
    }

    const passwordHash = await hashPassword(password);
    const created = await app.userStore.create({
      email,
      name,
      passwordHash,
      role: 'user',
    });
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
