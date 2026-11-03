import { readFile } from 'node:fs/promises';
import Redis from 'ioredis';
import postgres from 'postgres';
import {
  companyTransitionSchema,
  transitionCompanies,
} from '../src/services/company-transition.js';
import { OfferStore } from '../src/services/offer-store.js';
import { UserStore } from '../src/services/user-store.js';

const path = process.argv[2];
const apply = process.argv.includes('--apply');
if (!path || !process.env.DATABASE_URL || !process.env.REDIS_URL)
  throw new Error(
    'Usage: transition-companies.ts manifest.json [--apply]; DATABASE_URL and REDIS_URL required',
  );
// Redis identities and SQL memberships cannot be committed atomically together.
// Run apply only with account/offer writes paused; no API or worker is started here.
if (apply && !process.argv.includes('--account-writes-paused'))
  throw new Error('Apply requires --account-writes-paused and an actual maintenance window');
const plan = companyTransitionSchema.parse(JSON.parse(await readFile(path, 'utf8')));
const redis = new Redis(process.env.REDIS_URL);
const db = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
try {
  const users = await new UserStore(redis).listAll();
  const offers = await new OfferStore(redis, 'unused-read-only-inventory', db).listAll();
  const result = await transitionCompanies(db, plan, { users, offers }, apply);
  console.log(result);
  if (result.pendingRoleChanges.length)
    console.warn(
      'Company bindings can be staged, but global role changes remain pending. No Redis role was changed. Do not enable company cutover yet.',
    );
  if (result.onboardingUsers.length)
    console.warn(
      'Manifest includes company onboarding accounts. The new API onboarding gate must be deployed before cutover.',
    );
} finally {
  await redis.quit();
  await db.end();
}
