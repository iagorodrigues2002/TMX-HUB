import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { registerGetAuthInvitesRoutes } from './auth/get-auth-invites.js';
import { registerPostAuthLoginRoutes } from './auth/post-auth-login.js';

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  registerPostAuthLoginRoutes(app);
  registerGetAuthInvitesRoutes(app);
};

export default plugin;
