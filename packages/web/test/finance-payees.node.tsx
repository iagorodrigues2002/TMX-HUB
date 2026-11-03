import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { QueryClient } from '@tanstack/react-query';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CompensationReport } from '../src/components/overview/finance-compensation';
import { type Payee, PayeeRow } from '../src/components/overview/finance-payee-row';
import { PrivacyProvider } from '../src/lib/privacy-context';

const payee: Payee = {
  user_id: 'synthetic-member',
  name: 'Colaborador de teste',
  status: 'active',
  pix: { type: 'email' as const, value: 'pix@example.test' },
};

const report: CompensationReport = {
  configured: true,
  settings: {
    fixed_minor: 150000,
    enabled: true,
    model: 'upsell' as const,
    unit_minor: 1000,
    manual_minor: 0,
    profit_minor: null,
    percent_basis_points: 0,
  },
  upsells: 25,
  variable_minor: 25000,
  total_minor: 175000,
};
function render(row = payee, data = report) {
  return renderToStaticMarkup(
    <PrivacyProvider>
      <PayeeRow
        payee={row}
        month="2026-11"
        report={data}
        save={async () => {}}
        removePix={async () => {}}
      />
    </PrivacyProvider>,
  );
}

test('saved collaborator starts compact with the persisted fixed, variable and total amounts', () => {
  const html = render();
  assert.match(html, /Colaborador de teste/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /Fixo salvo/);
  assert.match(html, /Variável calculado/);
  assert.match(html, /Total previsto/);
  assert.match(html, /1\.500,00/);
  assert.match(html, /250,00/);
  assert.match(html, /1\.750,00/);
  assert.match(html, /25 upsells/);
  assert.match(html, /11\/2026/);
  assert.doesNotMatch(html, /<form|<input|pix@example\.test/);
  assert.match(html, /aria-label="Copiar chave Pix de Colaborador de teste"/);
  assert.match(html, /Copiar Pix/);
  assert.match(html, /Pix cadastrado/);
});

test('an empty registration cannot copy Pix and does not present defaults as saved amounts', () => {
  const html = render({ ...payee, pix: null }, { ...report, configured: false });
  const copy = html.match(/<button[^>]*aria-label="Copiar chave Pix[^>]*>/)?.[0];
  assert.ok(copy);
  assert.match(copy, /disabled=""/);
  assert.match(html, /Sem Pix cadastrado/);
  assert.match(html, /Não configurado/);
  assert.match(html, /Configurar dados/);
  assert.doesNotMatch(html, /1\.500,00|1\.750,00/);
});

test('profit without an informed base stays pending instead of becoming zero', () => {
  const html = render(payee, {
    ...report,
    settings: { ...report.settings, model: 'profit' },
    variable_minor: null,
    total_minor: null,
  });
  assert.match(html, /Informe o lucro/);
  assert.match(html, /Pendente/);
  assert.match(html, /1\.500,00/);
  assert.doesNotMatch(html, /1\.750,00/);
});

test('one save waits for both persisted sections and keeps drafts open on failure', () => {
  const source = ['finance-payee-row', 'finance-payees']
    .map((name) =>
      readFileSync(new URL(`../src/components/overview/${name}.tsx`, import.meta.url), 'utf8'),
    )
    .join('\n');
  assert.match(source, /if \(!payee\.pix \|\| pixDirty \|\| busy\) return/);
  assert.match(source, /await copyText\(payee\.pix\.value, 'Chave Pix copiada\.'\)/);
  assert.match(source, /value: pix\.value\.trim\(\)/);
  assert.match(source, /await save\([\s\S]*setEditing\(false\)/);
  assert.match(source, /compensation: \{ month, settings \}/);
  assert.ok(source.includes('`${path}/compensation/${month}`'));
  assert.match(source, /if \(!result\.compensation\) throw/);
  assert.match(source, /client\.cancelQueries\(\{ queryKey, exact: true \}\)/);
  assert.match(
    source,
    /client\.cancelQueries\(\{ queryKey: \['finance-payees', user\?\.id, company\], exact: true \}\)/,
  );
  assert.match(source, /Suas alterações foram mantidas/);
  assert.match(source, /setVisible\(false\)/);
  assert.match(source, /loadingLabel="Salvando…"/);
  assert.match(source, /Salvar dados do colaborador/);
  assert.match(source, /window\.confirm\('Remover a chave Pix deste colaborador\?'\)/);
});

test('clearing success resets the button instead of cancelling its only reset timer', () => {
  const source = readFileSync(new URL('../src/components/ui/button.tsx', import.meta.url), 'utf8');
  assert.match(source, /if \(!success\) \{\s*setShowSuccess\(false\);\s*return;/);
});

test('cancelled older reads cannot overwrite the authoritative saved summary', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const queryKey = ['compensation', 'viewer', 'company', 'member', '2026-11'];
  let resolveOld!: (value: CompensationReport) => void;
  const older = client
    .fetchQuery({
      queryKey,
      queryFn: () =>
        new Promise<CompensationReport>((resolve) => {
          resolveOld = resolve;
        }),
    })
    .catch(() => undefined);
  await client.cancelQueries({ queryKey, exact: true });
  client.setQueryData(queryKey, report);
  resolveOld({ ...report, configured: false, total_minor: 0 });
  await older;
  await Promise.resolve();
  assert.deepEqual(client.getQueryData(queryKey), report);
  client.clear();
});
