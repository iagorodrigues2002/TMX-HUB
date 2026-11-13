import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { safeAdThumbnail } from './spy-ad-preview';
import type { LibraryAd } from './spy-library-reader';

const recoveredSchema = z.record(
  z.string().regex(/^\d+$/),
  z.object({
    creativeRecoveredAt: z.string().datetime(),
    creativeComplete: z.boolean(),
    creativeText: z.string().max(100000).optional(),
    creativeAssets: z
      .array(
        z.object({
          kind: z.enum(['image', 'video']),
          url: z.string().max(10000),
          sha256: z
            .string()
            .regex(/^[a-f0-9]{64}$/)
            .optional(),
        }),
      )
      .max(30)
      .optional(),
    title: z.string().max(500).optional(),
    description: z.string().max(10000).optional(),
    thumbnailUrl: z
      .string()
      .max(10000)
      .refine((url) => Boolean(safeAdThumbnail(url)))
      .optional(),
  }),
);

export async function hydrateSpyRecovery(
  root: string,
  owner: string,
  job: { id: string; snapshots: { ads: LibraryAd[] }[] },
) {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(job.id)) return;
  let recovered: z.infer<typeof recoveredSchema>;
  try {
    recovered = recoveredSchema.parse(
      JSON.parse(
        await readFile(
          join(
            root,
            'creative-recovery',
            createHash('sha256').update(owner).digest('hex'),
            job.id,
            'enriched.json',
          ),
          'utf8',
        ),
      ),
    );
  } catch {
    return;
  }
  for (const reading of job.snapshots)
    for (const ad of reading.ads) {
      const extra = recovered[ad.id];
      // Keep the original collection intact; show the later recovery date explicitly.
      if (extra && !ad.creativeComplete) Object.assign(ad, extra);
    }
}
