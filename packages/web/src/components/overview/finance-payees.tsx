'use client';

import { Button } from '@/components/ui/button';
import { companyApi } from '@/lib/api-client/endpoints-companies';
import { request } from '@/lib/api-client/request';
import { useAuth } from '@/lib/auth-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { CompensationReport } from './finance-compensation';
import { type Payee, PayeeRow, type Pix } from './finance-payee-row';

function FinancePayeeCard({
  company,
  payee,
  month,
  onPixSaved,
}: {
  company: string;
  payee: Payee;
  month: string;
  onPixSaved: (pix: Pix | null) => void;
}) {
  const { user } = useAuth();
  const client = useQueryClient();
  const queryKey = ['compensation', user?.id, company, payee.user_id, month];
  const path = `/v1/companies/${encodeURIComponent(company)}/payees/${encodeURIComponent(payee.user_id)}`;
  const compensation = useQuery({
    queryKey,
    queryFn: () => request<CompensationReport>(`${path}/compensation/${month}`),
    gcTime: 0,
    retry: false,
  });
  if (compensation.isPending)
    return (
      <p className="p-4 text-sm text-muted-foreground">Carregando remuneração de {payee.name}…</p>
    );
  if (compensation.isError)
    return (
      <div role="alert" className="glass-card rounded-lg border border-border p-4">
        <p>Não foi possível carregar os dados de {payee.name}.</p>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            void compensation.refetch();
          }}
        >
          Tentar novamente
        </Button>
      </div>
    );
  return (
    <PayeeRow
      payee={payee}
      month={month}
      report={compensation.data}
      save={async (pix, settings) => {
        const result = await request<{ saved: true; compensation: CompensationReport }>(path, {
          method: 'PUT',
          body: { pix, compensation: { month, settings } },
        });
        if (!result.compensation) throw new Error('Resposta de remuneração ausente');
        await Promise.all([
          client.cancelQueries({ queryKey, exact: true }),
          client.cancelQueries({ queryKey: ['finance-payees', user?.id, company], exact: true }),
        ]);
        client.setQueryData(queryKey, result.compensation);
        onPixSaved(pix);
      }}
      removePix={async () => {
        await request(path, { method: 'PUT', body: { pix: null } });
        await client.cancelQueries({
          queryKey: ['finance-payees', user?.id, company],
          exact: true,
        });
        onPixSaved(null);
      }}
    />
  );
}

export function FinancePayees({ company: fixedCompany }: { company?: string } = {}) {
  const { user } = useAuth();
  const client = useQueryClient();
  const [selected, setSelected] = useState('');
  const [month, setMonth] = useState(() =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
    }).format(new Date()),
  );
  const companies = useQuery({
    queryKey: ['finance-companies', user?.id],
    queryFn: companyApi.list,
    enabled: !!user,
  });
  const managed =
    companies.data?.companies.filter((c) => c.role === 'owner' || c.role === 'admin') ?? [];
  const company =
    fixedCompany ?? managed.find((c) => c.id === selected)?.id ?? managed[0]?.id ?? '';
  const payeeKey = ['finance-payees', user?.id, company];
  const payees = useQuery({
    queryKey: payeeKey,
    enabled: !!company,
    queryFn: () =>
      request<{ payees: Payee[] }>(`/v1/companies/${encodeURIComponent(company)}/payees`),
    gcTime: 0,
  });
  return (
    <section
      aria-label="Colaboradores e Pix"
      className="glass-card space-y-4 rounded-xl border border-border bg-card p-5"
    >
      <h2 className="text-lg font-semibold">Colaboradores e Pix</h2>
      <p className="text-sm text-muted-foreground">
        Dados de pagamento restritos aos administradores da empresa. Salve Pix e remuneração juntos
        para consultar o resumo do mês.
      </p>
      <label className="grid gap-2 text-sm">
        Competência da remuneração
        <input
          type="month"
          className="rounded border border-border bg-background p-2"
          value={month}
          onChange={(e) => {
            if (/^20\d{2}-(0[1-9]|1[0-2])$/.test(e.target.value)) setMonth(e.target.value);
          }}
        />
      </label>
      {companies.isError ? (
        <p role="alert">Não foi possível consultar suas empresas.</p>
      ) : companies.isPending ? (
        <p>Carregando empresas…</p>
      ) : !managed.length ? (
        <p>Somente responsáveis pela empresa podem gerenciar chaves Pix.</p>
      ) : (
        <>
          <label className="grid gap-2 text-sm">
            Empresa
            <select
              className="rounded border border-border bg-background p-2"
              value={company}
              disabled={!!fixedCompany}
              onChange={(e) => setSelected(e.target.value)}
            >
              {managed.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {payees.isError ? (
            <p role="alert">Não foi possível carregar os colaboradores.</p>
          ) : payees.isPending ? (
            <p>Carregando colaboradores…</p>
          ) : !payees.data?.payees.length ? (
            <p className="text-sm text-muted-foreground">Nenhum colaborador nesta empresa.</p>
          ) : (
            payees.data.payees.map((payee) => (
              <FinancePayeeCard
                key={`${company}:${payee.user_id}:${month}`}
                company={company}
                payee={payee}
                month={month}
                onPixSaved={(pix) =>
                  client.setQueryData<{ payees: Payee[] }>(
                    payeeKey,
                    (current) =>
                      current && {
                        payees: current.payees.map((row) =>
                          row.user_id === payee.user_id ? { ...row, pix } : row,
                        ),
                      },
                  )
                }
              />
            ))
          )}
        </>
      )}
    </section>
  );
}
