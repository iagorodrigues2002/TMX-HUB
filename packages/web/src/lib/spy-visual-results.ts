import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
export const resultSchema = z.object({
  status: z.literal('complete'),
  companyId: z.string().uuid(),
  offerId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
  version: z.literal('spy-frames-v1'),
  at: z.string().datetime(),
  ads: z.array(z.string().regex(/^\d+$/)).length(2),
  costMicros: z.number().nonnegative(),
  costReserved: z.boolean(),
  result: z.object({
    classification: z.enum(['reused', 'variation', 'different', 'inconclusive']),
    reason: z.string(),
    similarities: z.array(z.string()),
    differences: z.array(z.string()),
    limitations: z.array(z.string()),
  }),
});
export async function readSpyVisualResults(root: string, company: string, offer: string) {
  const items: z.infer<typeof resultSchema>[] = [];
  let names: string[] = [];
  try {
    names = await readdir(root);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
  for (const name of names.filter((n) => /^[a-f0-9]{64}\.json$/.test(n))) {
    try {
      const parsed = resultSchema.safeParse(JSON.parse(await readFile(join(root, name), 'utf8')));
      if (parsed.success && parsed.data.companyId === company && parsed.data.offerId === offer)
        items.push(parsed.data);
    } catch {
      /* An interrupted or malformed entry is not a completed analysis. */
    }
  }
  return items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}
export const recoveredReferencesSchema = z
  .object({
    references: z.record(
      z.string().regex(/^\d+$/),
      z.object({
        id: z.string().regex(/^\d+$/),
        at: z.string().datetime(),
        pageName: z.string(),
        distance: z.number().int().min(0).max(64),
        method: z.literal('thumbnail_similarity'),
      }),
    ),
    unresolved: z.array(z.object({ id: z.string(), reason: z.string() })).default([]),
  })
  .passthrough();
