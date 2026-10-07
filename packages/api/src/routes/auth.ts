import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_TOOL_KEYS, type ToolKey } from '@page-cloner/shared';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { env } from '../env.js';
import { sendTransactionalEmail } from '../lib/brevo.js';
import { signJwt } from '../lib/jwt.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { BadRequestError, HttpProblem, zodToProblem } from '../lib/problem.js';
import { INVITE_RATE_LIMIT, LOGIN_RATE_LIMIT } from '../plugins/rate-limit.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

async function loadTemplate(name: string): Promise<string> {
  return readFile(join(__dirname, '../templates', name), 'utf-8');
}

interface InviteEmailData {
  inviterName: string;
  roleLabel: string;
  allowedTools?: string[];
  acceptUrl: string;
  expiresIn: string;
}

async function sendInviteEmail(
  email: string,
  data: InviteEmailData,
): Promise<{ messageId: string } | null> {
  if (!env.BREVO_API_KEY) {
    // In dev, warn and skip — don't hard-fail.
    console.warn('[invite] BREVO_API_KEY not set — email not sent.');
    return null;
  }

  const [htmlTemplate, txtTemplate] = await Promise.all([
    loadTemplate('invite-email.html'),
    loadTemplate('invite-email.txt'),
  ]);

  const toolsHtml =
    data.allowedTools && data.allowedTools.length > 0
      ? data.allowedTools
          .map(
            (t) =>
              `<span class="tools-chip" style="display:inline-block;margin:2px 4px 2px 0;padding:3px 10px;background-color:rgba(14,124,134,0.18);color:#22d3ee;border:1px solid rgba(34,211,238,0.22);border-radius:999px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:600;">${t}</span>`,
          )
          .join('')
      : '';

  const toolsText =
    data.allowedTools && data.allowedTools.length > 0
      ? data.allowedTools.join(', ')
      : 'Acesso completo';

  const vars: Record<string, string> = {
    inviterName: data.inviterName,
    roleLabel: data.roleLabel,
    toolsHtml,
    toolsText,
    acceptUrl: data.acceptUrl,
    expiresIn: data.expiresIn,
  };

  // Simple template handling — strip conditional blocks not needed
  let html = htmlTemplate;
  if (data.allowedTools && data.allowedTools.length > 0) {
    html = html.replace(/\{\{#if allowedTools\}\}/g, '').replace(/\{\{\/if\}\}/g, '');
    html = html.replace(/\{\{\^if allowedTools\}\}[\s\S]*?\{\{\/if\}\}/g, '');
  } else {
    html = html.replace(/\{\{#if allowedTools\}\}[\s\S]*?\{\{\/if\}\}/g, '');
    html = html.replace(/\{\{\^if allowedTools\}\}/g, '').replace(/\{\{\/if\}\}/g, '');
  }
  html = interpolate(html, vars);

  const txt = interpolate(txtTemplate, vars);

  return sendTransactionalEmail(env.BREVO_API_KEY, env.BREVO_SENDER_EMAIL, env.BREVO_SENDER_NAME, {
    to: [{ email }],
    subject: `${data.inviterName} convidou você para o TMX Hub`,
    htmlContent: html,
    textContent: txt,
  });
}

const ToolKeySchema = z.enum(ALL_TOOL_KEYS as [ToolKey, ...ToolKey[]]);

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
    /**
     * Quando presente, o usuário criado terá acesso restrito apenas a essas
     * ferramentas. Ausente/array vazio = acesso completo (legado).
     */
    allowed_tools: z.array(ToolKeySchema).min(1).max(20).optional(),
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
    let consumedInvite = false;
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
      consumedInvite = true;
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
      ...(scopedTools ? { allowedTools: scopedTools } : {}),
    });
    if (consumedInvite && inviteToken) {
      await app.inviteStore.consume(inviteToken).catch(() => {});
    }
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
          emailResult = await sendInviteEmail(invite.email, {
            inviterName,
            roleLabel,
            allowedTools: invite.allowedTools,
            acceptUrl,
            expiresIn,
          });
        } catch (err) {
          emailError = err instanceof Error ? err.message : 'Unknown error sending email.';
          app.log.error({ err, inviteToken: invite.token }, 'Failed to send invite email');
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

      const emailResult = await sendInviteEmail(invite.email, {
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
};

export default plugin;
