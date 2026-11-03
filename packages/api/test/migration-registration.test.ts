import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('registers compensation after its company membership dependency for deployment', () => {
  const runner = readFileSync(new URL('../scripts/migrate.mjs', import.meta.url), 'utf8');
  const registered = [...runner.matchAll(/'([0-9]+_[^']+\.sql)'/g)].map((match) => match[1]);
  expect(registered).toContain('112_company_compensation.sql');
  expect(registered.indexOf('112_company_compensation.sql')).toBeGreaterThan(
    registered.indexOf('109_company_memberships.sql'),
  );
  expect(registered.filter((file) => file === '112_company_compensation.sql')).toHaveLength(1);
  expect(registered.indexOf('113_company_finance.sql')).toBeGreaterThan(
    registered.indexOf('112_company_compensation.sql'),
  );
});
