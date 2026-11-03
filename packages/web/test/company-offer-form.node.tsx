import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderCreateOfferForm } from '../src/components/ofertas/offer-list-render-create-offer-form';

type FormProps = Parameters<typeof renderCreateOfferForm>[0];
function form(overrides: Partial<FormProps> = {}) {
  const empty = () => {};
  return renderToStaticMarkup(
    renderCreateOfferForm({
      companyId: 'company-a',
      setCompanyId: empty,
      companies: [
        { id: 'company-a', name: 'Company A', role: 'owner' },
        { id: 'company-b', name: 'Company B', role: 'owner' },
      ],
      companiesQuery: { isLoading: false, isError: false, refetch: empty },
      name: 'Offer A',
      setName: empty,
      dashboardId: '',
      setDashboardId: empty,
      utmifyLogin: '',
      setUtmifyLogin: empty,
      utmifyPassword: '',
      setUtmifyPassword: empty,
      utmifyAccess: false,
      setUtmifyAccess: empty,
      createAttempted: false,
      setCreateAttempted: empty,
      createMut: { isPending: false, mutate: empty },
      canCreate: true,
      createErrors: {
        companyId: null,
        name: null,
        dashboardId: null,
        utmifyLogin: null,
        utmifyPassword: null,
      },
      ...overrides,
    } as FormProps),
  );
}
test('creation uses an accessible company selector instead of an arbitrary name or legacy sharing', () => {
  const html = form();
  assert.match(html, /<select[^>]*id="offer-company"/);
  assert.match(html, /<option value="company-a" selected="">Company A<\/option>/);
  assert.match(html, /<option value="company-b">Company B<\/option>/);
  assert.match(html, /for="offer-company"/);
  assert.doesNotMatch(html, /<input[^>]*id="offer-company"/);
  assert.match(html, /Criar oferta/);
});
test('missing membership and loading failures explain why creation is unavailable', () => {
  const noCompany = form({ companies: [], companyId: '', canCreate: false });
  assert.match(noCompany, /precisa criar uma empresa ou ser administrador/);
  assert.match(noCompany, /<button(?=[^>]*type="submit")(?=[^>]*disabled="")[^>]*>/);
  const failed = form({
    companiesQuery: {
      isLoading: false,
      isError: true,
      refetch: async () => undefined,
    } as unknown as FormProps['companiesQuery'],
    canCreate: false,
  });
  assert.match(failed, /Não foi possível carregar as empresas/);
  assert.match(failed, /Tentar novamente/);
});
test('company options are scoped to the principal and sent as explicit company_id', () => {
  const state = readFileSync(
    new URL('../src/components/ofertas/offer-list-use-offer-list-state.tsx', import.meta.url),
    'utf8',
  );
  assert.match(state, /queryKey: \['companies', user\?\.id\]/);
  assert.match(state, /company\.role === 'owner' \|\| company\.role === 'admin'/);
  assert.match(state, /company_id: companyId/);
  assert.doesNotMatch(state, /company_name:|member_ids:/);
});
