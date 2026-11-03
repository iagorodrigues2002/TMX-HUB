'use client';

import { Input } from '@/components/ui/input';
import { usePrivacy } from '@/lib/privacy-context';
import { useId } from 'react';

export type CompensationSettings = {
  fixed_minor: number;
  enabled: boolean;
  model: 'upsell' | 'manual' | 'profit';
  unit_minor: number;
  manual_minor: number;
  profit_minor: number | null;
  percent_basis_points: number;
};
export type CompensationReport = {
  configured: boolean;
  settings: CompensationSettings;
  upsells: number;
  variable_minor: number | null;
  total_minor: number | null;
};

export function CompensationSummary({
  report,
  month,
}: { report: CompensationReport; month: string }) {
  const { isPrivate } = usePrivacy();
  const money = (value: number | null) =>
    isPrivate
      ? '••••'
      : !report.configured
        ? 'Não configurado'
        : value === null
          ? 'Pendente'
          : (value / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const { settings } = report;
  const model = !report.configured
    ? 'Configure a remuneração deste mês.'
    : !settings.enabled
      ? 'Variável desativado'
      : settings.model === 'upsell'
        ? `${report.upsells} upsells × ${money(settings.unit_minor)}`
        : settings.model === 'manual'
          ? 'Variável manual do mês'
          : settings.profit_minor === null
            ? 'Informe o lucro para calcular o variável.'
            : `Comissão sobre lucro informado${isPrivate ? '' : ` · ${(settings.percent_basis_points / 100).toLocaleString('pt-BR')}%`}`;
  return (
    <div className="space-y-3">
      <dl className="grid gap-3 sm:grid-cols-3">
        {[
          ['Fixo salvo', money(settings.fixed_minor)],
          ['Variável calculado', money(report.variable_minor)],
          ['Total previsto', money(report.total_minor)],
        ].map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd
              className={`mt-1 break-words font-mono text-lg font-semibold tabular-nums ${label === 'Total previsto' ? 'text-primary' : ''}`}
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">
        {month.slice(5)}/{month.slice(0, 4)} · {model}
      </p>
    </div>
  );
}

export function CompensationFields({
  settings,
  setSettings,
  upsells,
}: {
  settings: CompensationSettings;
  setSettings: (settings: CompensationSettings) => void;
  upsells: number;
}) {
  const { isPrivate } = usePrivacy();
  const id = useId();
  const number = (
    label: string,
    key: 'fixed_minor' | 'unit_minor' | 'manual_minor' | 'profit_minor' | 'percent_basis_points',
  ) => (
    <label htmlFor={`${id}-${key}`} className="grid min-w-0 gap-1 text-sm">
      {label}
      <Input
        id={`${id}-${key}`}
        type={isPrivate ? 'password' : 'number'}
        inputMode="decimal"
        step="0.01"
        min={key === 'profit_minor' ? undefined : 0}
        max={key === 'percent_basis_points' ? 100 : undefined}
        className="h-11"
        autoComplete="off"
        value={settings[key] === null ? '' : settings[key] / 100}
        onChange={(e) =>
          setSettings({
            ...settings,
            [key]:
              e.target.value === '' && key === 'profit_minor'
                ? null
                : Math.round(Number(e.target.value) * 100),
          })
        }
      />
    </label>
  );
  return (
    <div className="space-y-3 border-t border-border pt-4">
      <h4 className="font-medium">Remuneração mensal · BRL</h4>
      {number('Fixo mensal (R$)', 'fixed_minor')}
      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
        />
        Ativar remuneração variável
      </label>
      {settings.enabled && (
        <>
          <label className="grid gap-1 text-sm">
            Modelo
            <select
              className="h-11 rounded-md border border-input bg-background px-3 text-sm"
              value={settings.model}
              onChange={(e) =>
                setSettings({ ...settings, model: e.target.value as CompensationSettings['model'] })
              }
            >
              <option value="manual">Valor manual do mês</option>
              <option value="upsell">Por upsell aprovado · modelo Douglas</option>
              <option value="profit">Percentual sobre lucro informado</option>
            </select>
          </label>
          {settings.model === 'upsell' ? (
            <>
              {number('Valor por upsell (R$) · padrão 10,00', 'unit_minor')}
              <p className="text-sm">
                {upsells} upsells aprovados atribuídos ao colaborador no mês do clique vencedor.
              </p>
              <p className="text-xs text-muted-foreground">
                Crédito operacional, sem descontar devoluções, como em Resultados e atividade.
              </p>
            </>
          ) : settings.model === 'manual' ? (
            number('Variável manual (R$)', 'manual_minor')
          ) : (
            <>
              {number('Lucro apurado e informado para este mês (R$)', 'profit_minor')}
              {number('Comissão (%)', 'percent_basis_points')}
              <p className="text-xs text-muted-foreground">
                Faturamento não é lucro. Sem base informada, o total fica pendente. Lucro negativo
                gera comissão zero.
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
