import type { FastifyInstance } from 'fastify';

/** Temporary cutover guard, not a general maintenance mode. Match canonical route patterns. */
export function companyTransitionWrite(rawPath: string, method: string): boolean {
  const path = rawPath.split('?')[0]!.replace(/^\/v1(?=\/|$)/, '');
  if (method === 'POST')
    return (
      ['/auth/register', '/auth/invites', '/offers', '/companies', '/calls'].includes(path) ||
      /^\/auth\/invites\/[^/]+\/resend$/.test(path) ||
      /^\/companies\/[^/]+\/(members|offers)$/.test(path) ||
      /^\/calls\/[^/]+\/(cancel|complete)$/.test(path)
    );
  if (method === 'PUT')
    return /^\/companies\/[^/]+\/members\/[^/]+$/.test(path) || /^\/calls\/[^/]+$/.test(path);
  if (method === 'PATCH') return /^\/(users|offers)\/[^/]+$/.test(path);
  if (method === 'DELETE')
    return /^\/(users|offers)\/[^/]+$/.test(path) || /^\/auth\/invites\/[^/]+$/.test(path);
  return false;
}

export function registerCompanyTransitionPause(app: FastifyInstance, paused: boolean): void {
  if (!paused) return;
  app.addHook('onRequest', async (req, reply) => {
    if (!companyTransitionWrite(req.routeOptions.url ?? req.url, req.method)) return;
    return reply.code(503).header('Retry-After', '60').header('Cache-Control', 'no-store').send({
      error: 'company_transition_writes_paused',
      detail:
        'Cadastros temporariamente pausados para atualização de empresas. Tente novamente em instantes.',
    });
  });
}
