import type { ToolKey } from '@page-cloner/shared';
import type { Sql } from 'postgres';
import { scopeCompanyNavigationUser } from './company-navigation-access.js';
import { assertNavigationAccess } from './navigation-access.js';

/** A grant from another company must not authorize this offer's operator report. */
export async function assertOperatorReportAccess(
  db: Sql | null | undefined,
  user: { sub: string; role: 'admin' | 'user'; tools?: ToolKey[] },
  offerId?: string,
) {
  const scoped = offerId
    ? await scopeCompanyNavigationUser(db, user, '/offers/:id/tracking/upsell-operator-logs', {
        id: offerId,
      })
    : user;
  assertNavigationAccess(scoped, '/tracking/upsell-operator-logs', 'GET');
}
