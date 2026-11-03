'use client';

import { Button } from '@/components/ui/button';
import { request } from '@/lib/api-client/request';
import { useState } from 'react';

export const financeCategories = {
  income: 'Entrada',
  fixed: 'Custo fixo',
  variable: 'Custo variável',
  withdrawal: 'Saque',
  transfer: 'Transferência interna',
  card_topup: 'Recarga de cartão · fora das despesas',
  unclassified: 'Não classificada',
};
type Rules = { vendepay_income: boolean; withdrawal_recipient: string };
export function FinanceRules({
  company,
  rules,
  refresh,
}: { company: string; rules: Rules; refresh: () => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function save(enabled: boolean) {
    setBusy(true);
    setMessage('');
    try {
      await request(`/v1/companies/${company}/finance/rules`, {
        method: 'PUT',
        body: {
          vendepayIncome: enabled,
          withdrawalRecipient: enabled ? '52.210.584 IAGO RODRIGUES DA COSTA' : '',
        },
      });
      refresh();
      setMessage('Regras salvas somente para esta empresa. Classificações manuais preservadas.');
    } catch {
      setMessage('Não foi possível salvar as regras. Nenhuma confirmação de alteração.');
    } finally {
      setBusy(false);
    }
  }
  const enabled = rules.vendepay_income && !!rules.withdrawal_recipient;
  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3">
      <h3 className="font-semibold">Regras de classificação desta empresa</h3>
      <p className="text-sm text-muted-foreground">
        Créditos identificados como VendePay → Entrada. Débitos para 52.210.584 IAGO RODRIGUES DA
        COSTA → Saque. Aplicadas ao histórico e às novas importações. Saques não são custos
        operacionais.
      </p>
      <Button variant="outline" disabled={busy} onClick={() => void save(!enabled)}>
        {busy
          ? 'Salvando…'
          : enabled
            ? 'Desativar regras automáticas'
            : 'Ativar regras VendePay e saques'}
      </Button>
      <output className="block text-sm" aria-live="polite">
        {message}
      </output>
    </section>
  );
}

export function FinanceEntryCategory({
  company,
  entry,
  refresh,
}: {
  company: string;
  entry: {
    connection_id: string;
    external_id: string;
    category: string;
    category_override: string | null;
    sent: string | null;
    received: string | null;
  };
  refresh: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(category: string) {
    setBusy(true);
    setError('');
    try {
      await request(`/v1/companies/${company}/finance/classification`, {
        method: 'PUT',
        body: {
          connectionId: entry.connection_id,
          externalId: entry.external_id,
          category: category || null,
        },
      });
      refresh();
    } catch {
      setError('Não salvo. Confira a permissão e a direção da movimentação.');
    } finally {
      setBusy(false);
    }
  }
  const outgoing = Number(entry.sent) > 0 && !Number(entry.received);
  const incoming = Number(entry.received) > 0 && !Number(entry.sent);
  if (entry.category === 'card_topup')
    return (
      <span className="text-sm text-muted-foreground">Recarga de cartão · fora das despesas</span>
    );
  return (
    <div className="min-w-44">
      <select
        aria-label={`Classificar movimentação ${entry.external_id}`}
        className="min-h-11 w-full rounded-lg border border-input bg-bg-elevated px-3 py-2"
        value={entry.category_override ?? ''}
        disabled={busy}
        onChange={(e) => void save(e.target.value)}
      >
        <option value="">
          Automática:{' '}
          {financeCategories[entry.category as keyof typeof financeCategories] ??
            'Não classificada'}
        </option>
        {Object.entries(financeCategories)
          .filter(
            ([key]) =>
              (incoming && key === 'income') ||
              (outgoing && ['fixed', 'variable', 'withdrawal'].includes(key)),
          )
          .map(([key, label]) => (
            <option value={key} key={key}>
              {label}
            </option>
          ))}
      </select>
      {error && (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
