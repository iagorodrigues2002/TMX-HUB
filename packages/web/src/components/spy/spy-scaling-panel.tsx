'use client';
import { Button } from '@/components/ui/button';
import type { SpyScaling } from '@/lib/spy-scaling';
import { Sparkles, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { SpyScalingAssistant } from './spy-scaling-assistant';
import s from './spy.module.css';
const labels: Record<string, string> = {
  growing: 'Crescimento observado',
  new: 'Novo no histórico',
  stable: 'Sem crescimento',
  insufficient: 'Aguardando comparação',
  stale: 'Leitura desatualizada',
};
export function SpyScalingPanel({
  offer,
  evidence,
  companyId,
}: {
  offer: { id: string; name: string; domains: string[] };
  evidence: SpyScaling | null;
  companyId: string;
}) {
  const [onlyGrowth, setOnlyGrowth] = useState(true);
  const rows = evidence ? [{ offer, scaling: evidence }] : [];
  return (
    <section>
      <div className={s.sectionHeading}>
        <div>
          <h2>
            <TrendingUp size={22} /> Escalando
          </h2>
          <p>
            Criativos com mais anúncios ativos entre leituras da mesma busca. É um sinal de
            expansão, não confirmação de gasto ou vendas.
          </p>
        </div>
        <Button
          variant={onlyGrowth ? 'default' : 'outline'}
          aria-pressed={onlyGrowth}
          onClick={() => setOnlyGrowth(!onlyGrowth)}
        >
          Só com crescimento
        </Button>
      </div>
      {!rows.length && <p>Nenhuma leitura completa disponível para estas ofertas.</p>}
      {onlyGrowth && rows.length > 0 && !rows.some((r) => r.scaling.growing) && (
        <p>
          Nenhum crescimento confirmado nas leituras disponíveis. Desative o filtro para conferir os
          dados e as pendências.
        </p>
      )}
      {rows
        .filter(({ scaling }) => !onlyGrowth || scaling.growing > 0)
        .map(({ offer, scaling }) => (
          <article className={s.panel} key={offer.id}>
            <div className={s.sectionHeading}>
              <div>
                <h3>{offer.name}</h3>
                <small>
                  Última leitura: {new Date(scaling.at).toLocaleString('pt-BR')}
                  {scaling.previousAt &&
                    ` · comparada com ${new Date(scaling.previousAt).toLocaleString('pt-BR')}`}
                </small>
              </div>
              <Link className={s.collectionLink} href={`/spy/analise-visual?id=${offer.id}`}>
                <Sparkles size={16} /> Análise visual com IA
              </Link>
            </div>
            <div className={s.monitorMetrics}>
              {[
                ['Ads ativos encontrados', scaling.activeAds],
                [
                  'Variação de IDs',
                  scaling.delta === null ? '—' : `${scaling.delta > 0 ? '+' : ''}${scaling.delta}`,
                ],
                ['Mídias identificadas', scaling.assets],
                ['Páginas', scaling.pages],
                ['Domínios encontrados', scaling.domains.length],
              ].map(([label, value]) => (
                <div key={label}>
                  <small>{label}</small>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            <p>
              <strong>Destinos nos anúncios:</strong>{' '}
              {scaling.domains.join(' · ') || 'Não informados pelo provedor'}
            </p>
            {scaling.stale && (
              <output>
                Histórico com mais de 36 horas. Aguarde uma leitura atual antes de concluir que está
                escalando.
              </output>
            )}
            <SpyScalingAssistant
              key={`${companyId}:${offer.id}:${scaling.at}`}
              name={offer.name}
              companyId={companyId}
              evidence={scaling}
            />
            <div className={s.tableWrap}>
              <table>
                <caption className="sr-only">
                  Criativos e evolução dos anúncios de {offer.name}
                </caption>
                <thead>
                  <tr>
                    <th>Criativo / referência</th>
                    <th>Sinal</th>
                    <th>Ads ativos</th>
                    <th>Antes</th>
                    <th>Variação</th>
                    <th>Assets</th>
                    <th>Páginas / destinos</th>
                  </tr>
                </thead>
                <tbody>
                  {scaling.rows
                    .filter((row) => !onlyGrowth || row.signal === 'growing')
                    .slice(0, 12)
                    .map((row) => (
                      <tr key={row.key}>
                        <th>
                          <a href={row.url} target="_blank" rel="noreferrer">
                            {row.title}
                            <br />
                            <small>ID {row.id}</small>
                          </a>
                          <small className={s.muted}>
                            {row.mediaConfirmed
                              ? 'Mesma mídia confirmada por arquivo'
                              : 'Agrupamento da Library; mídia não confirmada'}
                          </small>
                        </th>
                        <td>
                          <span className={s.tag}>{labels[row.signal]}</span>
                        </td>
                        <td>{row.activeAds}</td>
                        <td>{row.previousAds ?? '—'}</td>
                        <td>
                          {row.delta === null ? '—' : `${row.delta > 0 ? '+' : ''}${row.delta}`}
                        </td>
                        <td>{row.assets || '—'}</td>
                        <td>
                          {row.pages.map((p) => p.name).join(' · ')}
                          <br />
                          <small>{row.domains.join(' · ') || 'Destino indisponível'}</small>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <p className={s.footnote}>
              Até 12 grupos prioritários nesta visão. Assets são mídias únicas identificadas; não
              são orçamento nem quantidade de vendas.
            </p>
            <Link className={s.collectionLink} href={`/spy?offer=${offer.id}`}>
              Ver oferta e histórico completo
            </Link>
          </article>
        ))}
    </section>
  );
}
