import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { visibleSpyNotices } from './spy-discovery-notices';
import { changeLibraryState, readLibraryState, spyLibraryDirectory } from './spy-library-store';
import { spyServerAccess, spyServerEnabled } from './spy-server-access';
export async function spyNotificationUser(req: Request) {
  if (spyServerEnabled()) return (await spyServerAccess(req))?.userId ?? null;
  if (
    process.env.NEXT_PUBLIC_TMX_LOCAL_PREVIEW_KIND !== 'synthetic' ||
    !['localhost:3120', '127.0.0.1:3120'].includes(new URL(req.url).host)
  )
    return null;
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  try {
    const r = await fetch('http://127.0.0.1:4110/v1/auth/me', {
      headers: { Authorization: auth },
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return null;
    return z.object({ user: z.object({ id: z.string().min(1).max(100) }) }).parse(await r.json())
      .user.id;
  } catch {
    return null;
  }
}
export async function spyNoticeFeed(
  recipient: string,
  readIds?: string[],
  dir = spyLibraryDirectory(),
  owners?: string[],
) {
  let files: string[] = [];
  try {
    files = await readdir(dir);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
  const result = [];
  for (const file of files) {
    if (!/^[a-f0-9]{64}\.json$/.test(file)) continue;
    const { owner } = JSON.parse(await readFile(join(dir, file), 'utf8'));
    if (owners && !owners.includes(owner)) continue;
    let state = await readLibraryState(owner, dir);
    if (
      readIds?.length &&
      state.notices.some((n) => n.recipientId === recipient && n.unread && readIds.includes(n.id))
    ) {
      state = await changeLibraryState(
        owner,
        (s) => ({
          ...s,
          notices: s.notices.map((n) =>
            n.recipientId === recipient && readIds.includes(n.id) ? { ...n, unread: false } : n,
          ),
        }),
        dir,
      );
    }
    result.push(...visibleSpyNotices(state.notices, recipient));
  }
  return { notifications: result.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) };
}
