import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ALL_TOOL_KEYS, type ToolKey, type User } from '@page-cloner/shared';
import { BadRequestError, HttpProblem, zodToProblem } from '../lib/problem.js';

const ToolKeySchema = z.enum(ALL_TOOL_KEYS as [ToolKey, ...ToolKey[]]);

const UpdateUserSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    role: z.enum(['admin', 'user']).optional(),
    /**
     * undefined = não muda. null = limpa (acesso total).
     * array = sobrescreve com essa lista. Vazio é tratado como null.
     */
    allowed_tools: z.array(ToolKeySchema).max(20).nullable().optional(),
  })
  .strict();

class ForbiddenError extends HttpProblem {
  constructor(detail = 'Operação não permitida.') {
    super({ status: 403, title: 'Forbidden', detail, code: 'forbidden' });
  }
}

class BusinessRuleError extends HttpProblem {
  constructor(detail: string, code = 'business_rule') {
    super({ status: 409, title: 'Conflict', detail, code });
  }
}

function userToWire(u: User): Record<string, unknown> {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    allowed_tools: u.allowedTools,
    created_at: u.createdAt,
  };
}

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  // GET /v1/users — admin lista todos os usuários
  app.get('/users', async (req, reply) => {
    if (!req.user) throw new BadRequestError('No user attached.');
    if (req.user.role !== 'admin') {
      throw new ForbiddenError('Apenas admins podem listar usuários.');
    }
    const users = await app.userStore.listAll();
    return reply.send({
      users: users.map((u) => userToWire(app.userStore.toPublic(u))),
    });
  });

  // PATCH /v1/users/:id — admin atualiza name/role/allowedTools
  app.patch<{ Params: { id: string } }>('/users/:id', async (req, reply) => {
    if (!req.user) throw new BadRequestError('No user attached.');
    if (req.user.role !== 'admin') {
      throw new ForbiddenError('Apenas admins podem atualizar usuários.');
    }
    const parsed = UpdateUserSchema.safeParse(req.body);
    if (!parsed.success) throw zodToProblem(parsed.error, req.url);

    const target = await app.userStore.getById(req.params.id);

    // Regras de segurança:
    // 1) Não permite que último admin perca a role.
    if (parsed.data.role === 'user' && target.role === 'admin') {
      const adminCount = await app.userStore.countAdmins();
      if (adminCount <= 1) {
        throw new BusinessRuleError(
          'Não dá pra rebaixar o último admin. Promova outro user primeiro.',
          'last_admin',
        );
      }
    }

    // 2) Admin novo não deve ter allowedTools (acesso total implícito).
    let allowedTools: ToolKey[] | null | undefined;
    if (parsed.data.allowed_tools !== undefined) {
      // null OU array vazio → limpa
      allowedTools =
        parsed.data.allowed_tools === null || parsed.data.allowed_tools.length === 0
          ? null
          : parsed.data.allowed_tools;
    }
    // Se a role final for admin, força allowedTools = null pra evitar inconsistência.
    const finalRole = parsed.data.role ?? target.role;
    if (finalRole === 'admin') allowedTools = null;

    const updated = await app.userStore.update(req.params.id, {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.role !== undefined ? { role: parsed.data.role } : {}),
      ...(allowedTools !== undefined ? { allowedTools } : {}),
    });
    return reply.send(userToWire(app.userStore.toPublic(updated)));
  });

  // DELETE /v1/users/:id — admin apaga user
  app.delete<{ Params: { id: string } }>('/users/:id', async (req, reply) => {
    if (!req.user) throw new BadRequestError('No user attached.');
    if (req.user.role !== 'admin') {
      throw new ForbiddenError('Apenas admins podem deletar usuários.');
    }
    // Não pode deletar a si mesmo (UX clara — evita lockout acidental).
    if (req.params.id === req.user.sub) {
      throw new BusinessRuleError(
        'Você não pode deletar a sua própria conta.',
        'self_delete',
      );
    }
    const target = await app.userStore.maybeGetById(req.params.id);
    if (!target) return reply.code(204).send();

    // Não permite deletar o último admin.
    if (target.role === 'admin') {
      const adminCount = await app.userStore.countAdmins();
      if (adminCount <= 1) {
        throw new BusinessRuleError(
          'Não dá pra deletar o último admin. Promova outro user primeiro.',
          'last_admin',
        );
      }
    }
    await app.userStore.delete(req.params.id);
    return reply.code(204).send();
  });
};

export default plugin;
