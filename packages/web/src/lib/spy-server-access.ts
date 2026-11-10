import { z } from 'zod';
export const spyServerEnabled = () => process.env.TMX_SPY_SERVER === '1';
export function spySameOrigin(req: Request) {
  const expected = spyServerEnabled() ? process.env.TMX_SPY_ORIGIN : 'http://localhost:3120';
  return !!expected && req.headers.get('origin') === expected;
}
export const spyAccessSchema = z.object({
  owner: z.string().regex(/^company:[a-f0-9-]{36}$/),
  companyId: z.string().uuid(),
  companyName: z.string(),
  userId: z.string(),
  canConfigure: z.boolean(),
  canEdit: z.boolean(),
  canMonitor: z.boolean(),
  owners: z.array(z.string().regex(/^company:[a-f0-9-]{36}$/)),
  companies: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
  users: z.array(z.object({ id: z.string(), name: z.string() })),
});
export async function spyServerAccess(req: Request, includeUsers = false) {
  if (!spyServerEnabled() || !process.env.TMX_SPY_ORIGIN || !process.env.API_PROXY_TARGET)
    return null;
  const cookie = req.headers.get('cookie') ?? '';
  const bearer =
    req.headers.get('authorization') ??
    (() => {
      const raw = cookie
        .split(';')
        .map((c) => c.trim())
        .find((c) => c.startsWith('tmx_hub_auth_token='))
        ?.slice(19);
      try {
        return raw ? `Bearer ${decodeURIComponent(raw)}` : null;
      } catch {
        return null;
      }
    })();
  if (!bearer?.startsWith('Bearer ')) return null;
  const company = cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('tmx_spy_company='))
    ?.slice(16);
  if (company && !z.string().uuid().safeParse(company).success) return null;
  try {
    const query = new URLSearchParams();
    if (company) query.set('company', company);
    if (includeUsers) query.set('people', '1');
    const r = await fetch(
      `${process.env.API_PROXY_TARGET.replace(/\/$/, '')}/v1/spy/access${query.size ? `?${query}` : ''}`,
      {
        headers: { Authorization: bearer },
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!r.ok) return null;
    return spyAccessSchema.parse(await r.json());
  } catch {
    return null;
  }
}
