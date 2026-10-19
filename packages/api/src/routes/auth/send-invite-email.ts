import { ALL_TOOL_KEYS, type ToolKey } from '@page-cloner/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../../env.js';
import { sendTransactionalEmail } from '../../lib/brevo.js';
import { type InviteEmailData, renderInviteEmail } from '../../lib/invite-email.js';
import { HttpProblem } from '../../lib/problem.js';

export async function sendInviteEmail(
  log: FastifyInstance['log'],
  email: string,
  data: InviteEmailData,
): Promise<{ messageId: string } | null> {
  if (!env.BREVO_API_KEY) {
    // In dev, warn and skip — don't hard-fail.
    log.warn('[invite] BREVO_API_KEY not set — email not sent.');
    return null;
  }

  const content = await renderInviteEmail(data);

  return sendTransactionalEmail(env.BREVO_API_KEY, env.BREVO_SENDER_EMAIL, env.BREVO_SENDER_NAME, {
    to: [{ email }],
    subject: `${data.inviterName} convidou você para o TMX Hub`,
    ...content,
  });
}

export const ToolKeySchema = z.enum(ALL_TOOL_KEYS as [ToolKey, ...ToolKey[]]);

export const LoginSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(6),
  })
  .strict();

export const RegisterSchema = z
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

export const CreateInviteSchema = z
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

export class ForbiddenError extends HttpProblem {
  constructor(detail = 'Operação não permitida.') {
    super({ status: 403, title: 'Forbidden', detail, code: 'forbidden' });
  }
}

export class InvalidCredentialsError extends HttpProblem {
  constructor() {
    super({
      status: 401,
      title: 'Invalid credentials',
      detail: 'Email ou senha incorretos.',
      code: 'invalid_credentials',
    });
  }
}
