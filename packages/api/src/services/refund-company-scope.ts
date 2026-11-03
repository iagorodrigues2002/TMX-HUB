import type { Offer } from '@page-cloner/shared';
import type { Sql } from 'postgres';
import { HttpProblem } from '../lib/problem.js';

export type RefundCompanyScope = {
  id: string | null;
  name: string | null;
  mode: 'company' | 'offer' | 'legacy' | 'unselected';
  selection_required: boolean;
  offer_ids: string[];
};

export async function resolveRefundCompanyScope(
  db: Sql,
  user: { sub: string; role: string },
  accessible: Offer[],
  filter: { offerId?: string; companyId?: string },
): Promise<{ offers: Offer[]; company_scope: RefundCompanyScope }> {
  const missingOffer = () =>
    new HttpProblem({ status: 404, title: 'Not Found', code: 'offer_not_found' });
  const selectedOffer = filter.offerId
    ? accessible.find((offer) => offer.id === filter.offerId)
    : null;
  if (filter.offerId && !selectedOffer) throw missingOffer();
  // Offer-specific summaries remain usable without choosing a company first.
  if (selectedOffer && !filter.companyId)
    return {
      offers: [selectedOffer],
      company_scope: {
        id: null,
        name: null,
        mode: 'offer',
        selection_required: false,
        offer_ids: [selectedOffer.id],
      },
    };

  const memberships = await db<{ id: string; name: string; status: string }[]>`
    SELECT c.id::text AS id,c.name,m.status FROM company_memberships m
    JOIN companies c ON c.id=m.company_id WHERE m.user_id=${user.sub}`;
  const active = memberships.filter((membership) => membership.status === 'active');
  let company = filter.companyId
    ? active.find((c) => c.id === filter.companyId)
    : active.length === 1
      ? active[0]
      : undefined;
  if (filter.companyId && !company) {
    if (user.role !== 'admin')
      throw new HttpProblem({ status: 403, title: 'Forbidden', code: 'refund_company_forbidden' });
    [company] = await db<{ id: string; name: string; status: string }[]>`
      SELECT id::text,name,'active'::text AS status FROM companies WHERE id::text=${filter.companyId}`;
    if (!company)
      throw new HttpProblem({ status: 404, title: 'Not Found', code: 'company_not_found' });
  }
  if (company) {
    const bindings = await db<
      { offer_id: string }[]
    >`SELECT offer_id FROM company_offers WHERE company_id::text=${company.id}`;
    const ids = new Set(bindings.map((binding) => binding.offer_id));
    const companyOffers = accessible.filter((offer) => ids.has(offer.id));
    if (selectedOffer && !ids.has(selectedOffer.id)) throw missingOffer();
    return {
      offers: selectedOffer ? [selectedOffer] : companyOffers,
      company_scope: {
        id: company.id,
        name: company.name,
        mode: 'company',
        selection_required: false,
        offer_ids: companyOffers.map((offer) => offer.id),
      },
    };
  }
  const scope: RefundCompanyScope = {
    id: null,
    name: null,
    mode: 'unselected',
    selection_required: active.length > 1,
    offer_ids: [],
  };
  // A revoked membership or an already-bound owner must never reopen legacy access.
  if (memberships.length) return { offers: [], company_scope: scope };
  const bound = await db`SELECT 1 FROM company_offers WHERE owner_user_id=${user.sub} LIMIT 1`;
  if (bound.length) return { offers: [], company_scope: scope };
  const legacy = accessible.filter(
    (offer) => offer.userId === user.sub && offer.companyName?.trim().toLowerCase() === 'tmx',
  );
  return {
    offers: legacy,
    company_scope: legacy.length
      ? {
          id: null,
          name: 'TMX',
          mode: 'legacy',
          selection_required: false,
          offer_ids: legacy.map((offer) => offer.id),
        }
      : scope,
  };
}
