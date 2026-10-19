'use client';

import { Button } from '@/components/ui/button';
import { DataState } from '@/components/ui/data-state';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';
import { BatchRow } from './ads-intelligence-center-batch-row';
import { renderImportStatus } from './ads-intelligence-center-render-import-status';
import {
  MetricColumns,
  type MetricKey,
  columns,
  selectClass,
  stickyColumnClass,
  tableWidth,
} from './ads-intelligence-center-support';
import { useAdsIntelligenceCenterState } from './ads-intelligence-center-use-ads-intelligence-center-state';

export function AdsIntelligenceCenter() {
  const {
    id,
    isPrivate,
    query,
    form,
    setForm,
    editing,
    setEditing,
    company,
    setCompany,
    offer,
    setOffer,
    sort,
    setSort,
    mappings,
    setMappings,
    save,
    mapping,
    data,
    importError,
    companies,
    offers,
    batches,
  } = useAdsIntelligenceCenterState();

  if (query.isPending) return <DataState variant="loading" title="Carregando Ads Intelligence" />;
  if (query.isError)
    return (
      <DataState
        variant="error"
        title="Não foi possível carregar os anúncios"
        description={query.error.message}
        onRetry={() => void query.refetch()}
      />
    );
  // Screen-reader table labels are positioned within their respective tables,
  // so their overflow stays inside the table scroll region.
  return (
    <div className="ads-intelligence-metrics relative min-w-0 space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Ads Intelligence</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Custos da UTMify e conversões do TMX, organizados por oferta e leva. Abra uma leva para
            comparar seus anúncios.
          </p>
        </div>
        {data?.connection && (
          <Button variant="outline" onClick={() => setEditing(!editing)}>
            {editing ? 'Fechar configuração' : 'Editar conexão'}
          </Button>
        )}
      </header>
      <section
        aria-label="Filtros dos anúncios"
        className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4"
      >
        <label className="flex w-full min-w-0 flex-col gap-1 text-xs text-muted-foreground sm:w-44">
          Empresa
          <select
            className={selectClass}
            value={company}
            onChange={(e) => {
              setCompany(e.target.value);
              setOffer('');
            }}
          >
            <option value="">Todas as empresas</option>
            {companies.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="flex w-full min-w-0 flex-col gap-1 text-xs text-muted-foreground sm:w-56">
          Oferta
          <select className={selectClass} value={offer} onChange={(e) => setOffer(e.target.value)}>
            <option value="">Todas as ofertas</option>
            {offers.map((o) => (
              <option key={o.id} value={o.id}>
                {o.company_name || 'Sem empresa'} · {o.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex w-full min-w-0 flex-col gap-1 text-xs text-muted-foreground sm:w-56">
          Ordenar levas e anúncios
          <select
            className={selectClass}
            value={sort}
            onChange={(e) => setSort(e.target.value as MetricKey)}
          >
            {columns.map((c) => (
              <option key={c.key} value={c.key}>
                Maior {c.label}
              </option>
            ))}
          </select>
        </label>
        <output className="block pb-3 text-xs text-muted-foreground">
          {batches.length} levas no filtro
        </output>
      </section>
      {(!data?.connection || editing) && (
        <form
          className="space-y-4 rounded-xl border border-border bg-card p-5"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <h2 className="font-semibold">Dashboard geral da UTMify</h2>
          <p className="text-sm text-muted-foreground">
            Acesso exclusivo para esta importação. Não ativa o login nas ofertas nem altera o envio
            de vendas. As credenciais são protegidas no servidor e não ficam salvas no navegador.
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            <label htmlFor={`${id}-login`} className="space-y-2 text-sm">
              Login
              <Input
                id={`${id}-login`}
                required
                autoComplete="off"
                value={form.login}
                onChange={(e) => setForm({ ...form, login: e.target.value })}
              />
            </label>
            <label htmlFor={`${id}-password`} className="space-y-2 text-sm">
              Senha
              <Input
                id={`${id}-password`}
                required
                type="password"
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </label>
            <label htmlFor={`${id}-dashboard`} className="space-y-2 text-sm">
              ID da dashboard
              <Input
                id={`${id}-dashboard`}
                required
                autoComplete="off"
                value={form.dashboard_id}
                onChange={(e) => setForm({ ...form, dashboard_id: e.target.value })}
              />
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            Primeira importação: desde 01/08/2026. Depois, atualização uma vez por semana. Abrir
            esta página não consulta a UTMify.
          </p>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar conexão
          </Button>
        </form>
      )}
      {data?.connection && renderImportStatus({ connection: data.connection, data, importError })}
      {!!data?.pending.length && (
        <details className="space-y-3 rounded-xl border border-border bg-card p-5">
          <summary className="min-h-11 cursor-pointer font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
            Campanhas aguardando revisão ({data.pending.length}){' '}
            <span className="ml-2 text-sm font-normal text-primary">Revisar campanhas</span>
          </summary>
          <p className="text-sm text-muted-foreground">
            Vincule a oferta quando ela não for reconhecida. Outros problemas de formato precisam
            ser corrigidos na origem. Dados pendentes ficam fora dos resultados.
          </p>
          {data.pending.map((p) => (
            <div
              key={p.campaign_key}
              className="flex flex-wrap items-center gap-3 border-t border-border pt-3"
            >
              <div className="min-w-0 basis-full break-words sm:basis-48 sm:flex-1">
                <p className="text-sm font-medium">{p.campaign_name}</p>
                <p className="text-xs text-muted-foreground">{p.reason}</p>
              </div>
              {p.can_map_offer ? (
                <>
                  <select
                    aria-label={`Oferta para ${p.campaign_name}`}
                    className={selectClass}
                    value={mappings[p.campaign_key] ?? ''}
                    onChange={(e) => setMappings({ ...mappings, [p.campaign_key]: e.target.value })}
                  >
                    <option value="">Selecione a oferta</option>
                    {data.offers.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.company_name || 'Sem empresa'} · {o.name}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="outline"
                    disabled={!mappings[p.campaign_key] || mapping.isPending}
                    onClick={() =>
                      mapping.mutate({
                        campaign_key: p.campaign_key,
                        offer_id: mappings[p.campaign_key]!,
                      })
                    }
                  >
                    Vincular
                  </Button>
                </>
              ) : (
                <span className="text-xs text-muted-foreground">Revisar formato da importação</span>
              )}
            </div>
          ))}
        </details>
      )}
      <section className="space-y-4">
        {!batches.length ? (
          <DataState
            variant="empty"
            title="Nenhuma leva disponível"
            description={
              data?.connection
                ? 'Aguarde a importação ou vincule as campanhas pendentes.'
                : 'Cadastre a dashboard geral para iniciar a importação.'
            }
          />
        ) : (
          <div className="relative overflow-x-auto rounded-xl border border-border bg-card">
            <table
              className="relative table-fixed text-sm"
              style={{ width: tableWidth, minWidth: tableWidth }}
            >
              <caption className="sr-only">
                Levas e anúncios; custos em reais e faturamento bruto registrado no TMX.
              </caption>
              <MetricColumns />
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th
                    scope="col"
                    className={`${stickyColumnClass} z-30 w-56 min-w-56 px-4 py-3 text-left`}
                  >
                    Leva
                  </th>
                  {columns.map((c) => (
                    <th scope="col" key={c.key} className="whitespace-nowrap px-3 py-3 text-right">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              {batches.map((batch) => (
                <BatchRow key={batch.key} batch={batch} sort={sort} privateMode={isPrivate} />
              ))}
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          ROAS = faturamento bruto ÷ gasto. ROI de mídia = (faturamento bruto − gasto) ÷ gasto. Não
          incluem taxas, reembolsos ou outros custos. ▲ Acima do equilíbrio de mídia (ROAS &gt; 1× /
          ROI &gt; 0%). ▼ Abaixo do equilíbrio. = No equilíbrio. “—” significa dado indisponível ou
          gasto zero. As taxas são recalculadas pelos totais, não pela média dos anúncios.
        </p>
      </section>
    </div>
  );
}
