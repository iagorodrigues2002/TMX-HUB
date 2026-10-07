import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify';
import { env } from '../env.js';
import { AuthUserCache } from '../lib/auth-user-cache.js';
import { type JwtPayload, verifyJwt } from '../lib/jwt.js';
import { hashPassword } from '../lib/password.js';
import { HttpProblem } from '../lib/problem.js';
import { ActivityStore } from '../services/activity-store.js';
import { UserStore } from '../services/user-store.js';

declare module 'fastify' {
  interface FastifyInstance {
    userStore: UserStore;
    activityStore: ActivityStore;
    /** Hook used as `preHandler` on protected routes. */
    requireAuth: (req: FastifyRequest) => Promise<void>;
    /** Drops cached authorization fields after role/tool changes or deletion. */
    invalidateAuthUser: (userId: string) => void;
  }
  interface FastifyRequest {
    /** Set by requireAuth on protected routes. */
    user?: JwtPayload;
  }
}

class UnauthorizedError extends HttpProblem {
  constructor(detail = 'Token ausente ou inválido.') {
    super({
      status: 401,
      title: 'Unauthorized',
      detail,
      code: 'unauthorized',
    });
  }
}

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  const userStore = new UserStore(app.redis);
  const activityStore = new ActivityStore(app.redis);
  const authUserCache = new AuthUserCache(20_000, 1_000);
  app.decorate('userStore', userStore);
  app.decorate('activityStore', activityStore);
  app.decorate('invalidateAuthUser', (userId: string) => authUserCache.invalidate(userId));

  // Bootstrap admin on first boot if env vars are present and no users exist.
  if (env.ADMIN_EMAIL && env.ADMIN_PASSWORD) {
    const existing = await userStore.getByEmail(env.ADMIN_EMAIL);
    if (!existing) {
      try {
        const passwordHash = await hashPassword(env.ADMIN_PASSWORD);
        await userStore.create({
          email: env.ADMIN_EMAIL,
          name: env.ADMIN_NAME,
          passwordHash,
          role: 'admin',
        });
        app.log.info('bootstrap admin created');
      } catch (err) {
        app.log.warn({ err }, 'failed to bootstrap admin (likely race)');
      }
    }
  }

  // Decorator returns a handler bound to the request — works with preHandler.
  const requireAuth = async (req: FastifyRequest): Promise<void> => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedError();
    }
    const token = header.slice(7).trim();
    if (!token) throw new UnauthorizedError();
    const payload = verifyJwt(token, env.JWT_SECRET);
    if (!payload) throw new UnauthorizedError('Token expirado ou inválido.');
    // Keep permission changes fresh without paying a Redis round-trip on every
    // authenticated request. Mutation routes invalidate this entry eagerly.
    let user = authUserCache.get(payload.sub);
    if (!user) {
      const storedUser = await userStore.maybeGetById(payload.sub);
      if (!storedUser) throw new UnauthorizedError('Usuário não encontrado.');
      user = { role: storedUser.role, allowedTools: storedUser.allowedTools };
      authUserCache.set(payload.sub, user);
    }
    req.user = {
      ...payload,
      role: user.role,
      ...(user.allowedTools && user.allowedTools.length > 0
        ? { tools: user.allowedTools }
        : { tools: undefined }),
    };
  };

  app.decorate('requireAuth', requireAuth);
};

(plugin as unknown as Record<symbol, boolean>)[Symbol.for('skip-override')] = true;

export default plugin;
