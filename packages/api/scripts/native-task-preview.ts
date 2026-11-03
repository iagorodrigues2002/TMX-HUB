// Local synthetic harness only: no commercial routes, Redis, workers or external requests.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import Fastify from 'fastify';
import postgres from 'postgres';

if (process.env.NODE_ENV === 'production' || process.env.DATABASE_URL)
  throw Error('Preview refuses production mode or an inherited DATABASE_URL');
process.env.JWT_SECRET = 'synthetic-native-preview-only-at-least-32';
process.env.TASK_MANAGEMENT_MODE = 'native';
process.env.TASK_AUTOMATION_SECRET = 'synthetic-native-preview-bridge-only-12345';
process.env.TASK_DISCORD_CHANNELS_JSON = '{"Spy":"456","Calls":"789"}';
const { taskManagementRoutes } = await import('../src/routes/task-management.js');
const { callManagementRoutes } = await import('../src/routes/call-management.js');
const { notificationCenterRoutes } = await import('../src/routes/notification-center.js');
const { nativeTaskAutomationRoutes } = await import('../src/routes/native-task-automation.js');
const { HttpProblem, sendProblem } = await import('../src/lib/problem.js');
const url = 'postgres://tmx_tasks_test:synthetic-native-only@127.0.0.1:32779/tmx_tasks_test';
const existingSchema = process.env.NATIVE_PREVIEW_SCHEMA;
if (existingSchema && !/^native_preview_[a-f0-9]{32}$/.test(existingSchema))
  throw Error('Invalid synthetic preview schema');
const schema = existingSchema ?? `native_preview_${randomUUID().replaceAll('-', '')}`;
const root = postgres(url, { max: 1, onnotice: () => {} });
if (existingSchema) {
  const found = await root`SELECT 1 FROM information_schema.schemata WHERE schema_name=${schema}`;
  if (!found.length) throw Error('Synthetic preview schema not found');
} else await root.unsafe(`CREATE SCHEMA ${schema}`);
const db = postgres(url, { max: 5, connection: { search_path: schema }, onnotice: () => {} });
for (const file of [
  '105_task_management.sql',
  '106_call_management.sql',
  '107_notification_center.sql',
  '108_native_task_management.sql',
])
  if (!existingSchema)
    await db.unsafe(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
const users = ['admin', 'member', 'other'].map((id) => ({
  id,
  name: `QA ${id}`,
  email: `${id}@native.tmx.test`,
  role: id === 'admin' ? 'admin' : 'user',
  createdAt: new Date().toISOString(),
}));
for (const [i, u] of users.entries()) {
  if (existingSchema) continue;
  const person = {
    id: randomUUID(),
    name: u.name,
    userId: u.id,
    discordId: String(123 + i),
    clickupId: null,
  };
  await db`INSERT INTO managed_task_people(id,discord_id,body) VALUES(${person.id},${person.discordId},${db.json(person)})`;
}
const app = Fastify({ logger: false });
app.decorate('db', db);
app.decorate('userStore', {
  getById: async (id: string) => users.find((u) => u.id === id),
  maybeGetById: async (id: string) => users.find((u) => u.id === id),
});
app.decorate('offerStore', { listAccessible: async () => [] });
app.setErrorHandler((error, _req, reply) => {
  if (error instanceof HttpProblem) return sendProblem(reply, error);
  console.error(error.message);
  return reply.code(500).send({ detail: 'Synthetic preview request failed' });
});
app.addHook('preHandler', async (req) => {
  const token = req.headers.authorization?.replace(/^Bearer /, '');
  const u = users.find((user) => token === `synthetic-native-${user.id}`);
  if (u)
    req.user = {
      sub: u.id,
      role: u.role as 'admin' | 'user',
      email: u.email,
      iat: 0,
      exp: 4102444800,
    };
});
app.post('/v1/auth/login', async (req, reply) => {
  const body = req.body as { email?: string; password?: string };
  const user = users.find((u) => u.email === body.email);
  if (!user || body.password !== 'Synthetic-preview-2026!')
    return reply.code(401).send({ detail: 'Synthetic credentials only' });
  return { user, token: `synthetic-native-${user.id}`, expires_at: '2100-01-01T00:00:00Z' };
});
app.get('/v1/auth/me', async (req, reply) =>
  req.user
    ? { user: users.find((u) => u.id === req.user!.sub) }
    : reply.code(401).send({ detail: 'Login required' }),
);
app.get('/v1/users', async (req, reply) =>
  req.user?.role === 'admin'
    ? { users: users.map((u) => ({ ...u, created_at: u.createdAt })) }
    : reply.code(403).send({ detail: 'Admin only' }),
);
app.get('/v1/offers', async () => ({ offers: [], total: 0 }));
await app.register(taskManagementRoutes, { prefix: '/v1' });
await app.register(callManagementRoutes, { prefix: '/v1' });
await app.register(notificationCenterRoutes, { prefix: '/v1' });
await app.register(nativeTaskAutomationRoutes, { prefix: '/v1' });
// Background commercial features are intentionally unavailable in this harness.
app.setNotFoundHandler((_req, reply) =>
  reply.code(404).send({ detail: 'Consulta indisponível na API sintética local.' }),
);
async function stop() {
  await app.close();
  await db.end();
  // Keep resumed preview data intact across local server restarts.
  if (!existingSchema) await root.unsafe(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
  process.exit(0);
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
await app.listen({ host: '127.0.0.1', port: 4110 });
console.log(
  'Synthetic native task API: http://127.0.0.1:4110; admin@native.tmx.test; synthetic password documented in this local-only harness.',
);
