import type { ToolKey } from '@page-cloner/shared';
import type { FastifyInstance } from 'fastify';
import { env } from '../../env.js';
import { signJwt } from '../../lib/jwt.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { BadRequestError, zodToProblem } from '../../lib/problem.js';
import { INVITE_RATE_LIMIT, LOGIN_RATE_LIMIT } from '../../plugins/rate-limit.js';
import {
  CreateInviteSchema,
  ForbiddenError,
  InvalidCredentialsError,
  LoginSchema,
  RegisterSchema,
  sendInviteEmail,
} from './send-invite-email.js';

export function registerPostAuthLoginRoutes(app: FastifyInstance) {
  // POST /v1/auth/login → { user, token, expires_at }
  app.post('/auth/login', { config: { rateLimit: LOGIN_RATE_LIMIT } }, async (req, reply) => {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) throw zodToProblem(parsed.error, req.url);
    const { email, password } = parsed.data;
    const user = await app.userStore.getByEmail(email);
    if (!user) throw new InvalidCredentialsError();
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) throw new InvalidCredentialsError();
    const { token, payload } = signJwt(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        ...(user.allowedTools && user.allowedTools.length > 0 ? { tools: user.allowedTools } : {}),
      },
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
    let registrationInvite: { token: string; createdAt: string } | undefined;
    let scopedTools: ToolKey[] | undefined;

    if (isFirstRun) {
      // Anybody can claim the first slot, and they become admin.
      creatingAdmin = true;
    } else if (inviteToken) {
      // Tier 2.5: convite válido contorna ALLOW_REGISTRATION.
      const invite = await app.inviteStore.get(inviteToken);
      if (!invite) {
        throw new ForbiddenError('Convite inválido ou expirado.');
      }
      registrationInvite = { token: inviteToken, createdAt: invite.createdAt };
      // Convite com escopo restrito → user nasce com allowedTools.
      if (invite.allowedTools && invite.allowedTools.length > 0) {
        scopedTools =
          invite.allowedTools.includes('ofertas-ia') && !invite.allowedTools.includes('ofertas')
            ? [...invite.allowedTools, 'ofertas']
            : invite.allowedTools;
      }
    } else if (!env.ALLOW_REGISTRATION) {
      // Tier 3: must be authenticated admin.
      try {
        await app.requireAuth(req);
      } catch {
        throw new ForbiddenError('Registro fechado. Solicite um convite a um administrador.');
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
      ...(creatingAdmin ? { requireEmptyStore: true } : {}),
      ...(registrationInvite ? { invite: registrationInvite } : {}),
      ...(scopedTools ? { allowedTools: scopedTools } : {}),
    });
    const { token, payload } = signJwt(
      {
        sub: created.id,
        email: created.email,
        role: created.role,
        ...(scopedTools ? { tools: scopedTools } : {}),
      },
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
  app.get<{ Params: { token: string } }>('/auth/invites/:token', async (req, reply) => {
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
      allowed_tools: invite.allowedTools,
    });
  });

  // POST /v1/auth/invites — admin gera novo convite e envia email pelo Brevo.
  app.post(
    '/auth/invites',
    { preHandler: (req) => app.requireAuth(req), config: { rateLimit: INVITE_RATE_LIMIT } },
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
        ...(parsed.data.allowed_tools && parsed.data.allowed_tools.length > 0
          ? { allowedTools: parsed.data.allowed_tools }
          : {}),
      });

      const acceptUrl = `${env.INVITE_ACCEPT_URL_BASE}?invite=${invite.token}`;
      const inviterName = me?.name ?? req.user.sub;
      const roleLabel = 'Membro';
      const expiresIn = `${days} ${days === 1 ? 'dia' : 'dias'}`;

      let emailResult: { messageId: string } | null = null;
      let emailError: string | undefined;

      if (invite.email) {
        try {
          emailResult = await sendInviteEmail(app.log, invite.email, {
            inviterName,
            roleLabel,
            allowedTools: invite.allowedTools,
            acceptUrl,
            expiresIn,
          });
        } catch (err) {
          emailError = err instanceof Error ? err.message : 'Unknown error sending email.';
          app.log.error({ err }, 'Failed to send invite email');
        }
      }

      const body = {
        ok: true,
        invite: {
          token: invite.token,
          email: invite.email,
          name: invite.name,
          created_at: invite.createdAt,
          expires_at: invite.expiresAt,
          invited_by: invite.createdByName,
          allowed_tools: invite.allowedTools,
          sent_at: emailResult ? new Date().toISOString() : null,
          message_id: emailResult?.messageId ?? null,
        },
      };

      if (emailError) {
        return reply.code(207).send({ ...body, email_error: emailError });
      }

      return reply.code(201).send(body);
    },
  );

  // POST /v1/auth/invites/:token/resend — admin reenvia email do convite.
  app.post<{ Params: { token: string } }>(
    '/auth/invites/:token/resend',
    { preHandler: (req) => app.requireAuth(req) },
    async (req, reply) => {
      if (req.user?.role !== 'admin') {
        throw new ForbiddenError('Apenas admins podem reenviar convites.');
      }
      const invite = await app.inviteStore.get(req.params.token);
      if (!invite) {
        return reply.code(404).send({ valid: false, detail: 'Convite inválido ou expirado.' });
      }
      if (!invite.email) {
        throw new BadRequestError('Este convite não tem email associado para reenvio.');
      }

      const me = await app.userStore.maybeGetById(req.user.sub);
      const inviterName = me?.name ?? req.user.sub;
      const acceptUrl = `${env.INVITE_ACCEPT_URL_BASE}?invite=${invite.token}`;
      const expiresAt = new Date(invite.expiresAt);
      const daysLeft = Math.max(
        1,
        Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
      );
      const expiresIn = `${daysLeft} ${daysLeft === 1 ? 'dia' : 'dias'}`;

      const emailResult = await sendInviteEmail(app.log, invite.email, {
        inviterName,
        roleLabel: 'Membro',
        allowedTools: invite.allowedTools,
        acceptUrl,
        expiresIn,
      });

      return reply.send({
        ok: true,
        sent_at: new Date().toISOString(),
        message_id: emailResult?.messageId ?? null,
      });
    },
  );
}
