import { spyNoticeFeed, spyNotificationUser } from '@/lib/spy-notification-access';
import { spySameOrigin, spyServerAccess, spyServerEnabled } from '@/lib/spy-server-access';
import { z } from 'zod';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
export async function GET(req: Request) {
  const user = await spyNotificationUser(req);
  if (!user) return reply({ detail: 'Sessão local necessária.' }, 403);
  if (!spyServerEnabled() && new URL(req.url).searchParams.get('fixture') === '1')
    return reply({
      notifications: [
        {
          id: `spy:${'0'.repeat(64)}`,
          kind: 'spy',
          createdAt: new Date().toISOString(),
          unread: false,
          title: 'Teste simulado: novidades no Spy',
          spy: {
            offerId: 'sheet-34',
            offerName: 'Teste simulado',
            newAds: 2,
            newPages: 1,
            pageNames: ['Página de demonstração · dados fictícios'],
          },
        },
      ],
    });
  try {
    const access = spyServerEnabled() ? await spyServerAccess(req) : null;
    if (spyServerEnabled() && !access) return reply({ detail: 'Acesso não autorizado.' }, 403);
    return reply(await spyNoticeFeed(user, undefined, undefined, access?.owners));
  } catch {
    return reply({ detail: 'Alertas Spy temporariamente indisponíveis.' }, 503);
  }
}
export async function POST(req: Request) {
  const user = await spyNotificationUser(req);
  if (!user || !spySameOrigin(req)) return reply({ detail: 'Acesso inválido.' }, 403);
  try {
    const reader = req.body?.getReader();
    if (!reader) throw Error('body');
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 50000) {
        await reader.cancel();
        return reply({ detail: 'Lote muito grande.' }, 400);
      }
      chunks.push(value);
    }
    const { ids } = z
      .object({
        ids: z
          .array(z.string().regex(/^spy:[a-f0-9]{64}$/))
          .min(1)
          .max(500),
      })
      .parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    const access = spyServerEnabled() ? await spyServerAccess(req) : null;
    if (spyServerEnabled() && !access) return reply({ detail: 'Acesso não autorizado.' }, 403);
    await spyNoticeFeed(user, ids, undefined, access?.owners);
    return reply({ ok: true });
  } catch {
    return reply({ detail: 'Não foi possível marcar os alertas.' }, 400);
  }
}
