import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const seed = readFileSync(new URL('../scripts/seed-complete-preview.ts', import.meta.url), 'utf8');
const launcher = readFileSync(
  new URL('../../../scripts/complete-local-preview.mjs', import.meta.url),
  'utf8',
);

describe('isolated company seed contract', () => {
  it('uses exactly the disposable launcher database and Redis, never runtime production', () => {
    const database = seed.match(/const databaseUrl =\s*'([^']+)'/)?.[1];
    const redis = seed.match(/const redisUrl = '([^']+)'/)?.[1];
    expect(database).toBeTruthy();
    expect(redis).toBeTruthy();
    expect(launcher).toContain(database!);
    expect(launcher).toContain(redis!);
    expect(seed).toContain("process.env.NODE_ENV === 'production'");
    expect(seed).toContain('process.env.DATABASE_URL !== databaseUrl');
    expect(seed).toContain('process.env.REDIS_URL !== redisUrl');
  });
  it('creates explicit owners before creating scoped offers and does not overwrite existing permissions', () => {
    expect(seed.indexOf('INSERT INTO company_memberships')).toBeLessThan(
      seed.indexOf('await offers.create'),
    );
    expect(seed).toContain('companyId: tmxCompanyId');
    expect(seed).toContain('companyId: otherCompanyId');
    expect(seed).toContain(
      "'owner',${sql.array(ALL_TOOL_KEYS)}::text[],true) ON CONFLICT DO NOTHING",
    );
    expect(seed).toContain('binding.company_id !== specification.companyId');
    expect(seed).toContain('refusing reassignment');
  });
  it('the collaborator receives a scoped membership and only the first offer grant', () => {
    expect(seed).toContain(
      "'member','member',ARRAY['ofertas','nav:scoped','nav:offers-all','nav:tracking-upsell-intelligence'],false)",
    );
    expect(seed).toMatch(/if \(index === 0\)[\s\S]*?INSERT INTO company_offer_grants/);
    expect(seed).not.toContain("memberIds: ['member']");
  });
});
