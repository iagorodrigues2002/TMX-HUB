'use client';

import { request } from '@/lib/api-client/request';
import { useAuth } from '@/lib/auth-context';
import type { DateRange } from '@/lib/date-range';
import world from '@d3-maps/atlas/world/countries/countries-110m';
import { useQueries } from '@tanstack/react-query';
import { geoNaturalEarth1, geoPath } from 'd3-geo';
import type { FeatureCollection, Geometry } from 'geojson';
import countries from 'i18n-iso-countries';
import pt from 'i18n-iso-countries/langs/pt.json';
import { Globe2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { feature } from 'topojson-client';
import styles from './country-activity-map.module.css';

countries.registerLocale(pt);
type Row = {
  country: string;
  events: number;
  checkouts: number;
  paid_orders: number;
  journey_linked: number;
  visitor_linked: number;
  buyer_country: number;
};
type Response = { version: string; rows: Row[]; generated_at: string };
const name = (code: string) => countries.getName(code, 'pt') ?? 'País não identificado';

export function CountryActivityMap({
  offerIds,
  period,
  animated,
}: { offerIds: string[]; period: DateRange; animated: boolean }) {
  const { user } = useAuth();
  const scope = `${user?.id}:${user?.role}:${[...new Set(offerIds)].sort().join(',')}:${period.from}:${period.to}`;
  return (
    <Activity
      key={scope}
      offerIds={[...new Set(offerIds)]}
      period={period}
      animated={animated}
      scope={scope}
    />
  );
}

function Activity({
  offerIds,
  period,
  animated,
  scope,
}: { offerIds: string[]; period: DateRange; animated: boolean; scope: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [pulses, setPulses] = useState<string[]>([]);
  const previous = useRef<Map<string, Row> | null>(null);
  const queries = useQueries({
    queries: offerIds.map((id) => ({
      queryKey: ['country-activity', scope, id],
      queryFn: () =>
        request<Response>(
          `/v1/offers/${id}/tracking/country-activity?${new URLSearchParams({ from: period.from, to: period.to })}`,
        ),
      retry: false,
      staleTime: 30_000,
      refetchInterval: 30_000,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: false,
    })),
  });
  const failed = queries.some((q) => q.isError || (q.data && q.data.version !== 'pre-purchase-v1'));
  const loading = queries.some((q) => q.isPending);
  const rows = new Map<string, Row>();
  if (!failed && !loading)
    for (const query of queries)
      for (const row of query.data?.rows ?? []) {
        const code = countries.isValid(row.country) ? row.country : 'ZZ';
        const total = rows.get(code) ?? {
          country: code,
          events: 0,
          checkouts: 0,
          paid_orders: 0,
          journey_linked: 0,
          visitor_linked: 0,
          buyer_country: 0,
        };
        for (const key of [
          'events',
          'checkouts',
          'paid_orders',
          'journey_linked',
          'visitor_linked',
          'buyer_country',
        ] as const)
          total[key] += row[key];
        rows.set(code, total);
      }
  const signature = JSON.stringify([...rows.values()]);
  useEffect(() => {
    if (failed || loading) {
      previous.current = null;
      setPulses([]);
      return;
    }
    const next = new Map<string, Row>(
      (JSON.parse(signature) as Row[]).map((row) => [row.country, row]),
    );
    const changed: string[] = [];
    if (previous.current)
      for (const [code, row] of next) {
        const before = previous.current.get(code);
        if (row.paid_orders > (before?.paid_orders ?? 0)) changed.push(`${code}:paid`);
        if (row.checkouts > (before?.checkouts ?? 0)) changed.push(`${code}:checkout`);
      }
    previous.current = next;
    setPulses(changed);
    const timer = setTimeout(() => setPulses([]), 1400);
    return () => clearTimeout(timer);
  }, [signature, failed, loading]);
  const geometry = useMemo(() => {
    const collection = feature(world, world.objects.features!) as FeatureCollection<Geometry>;
    const path = geoPath(geoNaturalEarth1().fitSize([960, 430], collection));
    return collection.features.map((item) => ({
      id: String(item.properties?.id ?? ''),
      path: path(item) ?? '',
      center: path.centroid(item),
    }));
  }, []);
  const picked = selected ? rows.get(selected) : null;
  return (
    <section className={styles.panel} aria-label="Atividade global real">
      <header className={styles.header}>
        <h3>
          <Globe2 size={16} aria-hidden /> Atividade global
        </h3>
        <span>Atualiza a cada 30 s</span>
      </header>
      <p className={styles.legend}>
        <span className={styles.purchase}>● Compras aprovadas</span>
        <span className={styles.checkout}>● Checkouts</span>
      </p>
      <div className={styles.map}>
        <svg viewBox="0 0 960 430" aria-label="Mapa com compras e checkouts por país">
          <title>Mapa com compras e checkouts por país</title>
          {geometry.map((item) => {
            const code = countries.alpha3ToAlpha2(item.id) ?? item.id;
            const row = rows.get(code);
            const [x, y] = item.center;
            return (
              <g key={item.id}>
                <path d={item.path} fill="#10313c" stroke="#22606b" strokeWidth=".6" />
                {row &&
                (row.paid_orders || row.checkouts) &&
                Number.isFinite(x) &&
                Number.isFinite(y) ? (
                  <g
                    tabIndex={0}
                    // biome-ignore lint/a11y/useSemanticElements: SVG requires a group; keyboard and focus implement button behavior.
                    role="button"
                    aria-label={`${name(code)}: ${row.paid_orders} compras e ${row.checkouts} checkouts`}
                    onMouseEnter={() => setSelected(code)}
                    onFocus={() => setSelected(code)}
                    onClick={() => setSelected(code)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelected(code);
                      }
                    }}
                  >
                    <title>
                      {name(code)}: {row.paid_orders} compras · {row.checkouts} checkouts
                    </title>
                    <circle cx={x} cy={y} r="19" fill="transparent" />
                    {row.paid_orders > 0 && (
                      <>
                        {animated && (
                          <circle
                            cx={(x ?? 0) - 6}
                            cy={y}
                            r="5"
                            fill="none"
                            stroke="#48d6a1"
                            className={`${styles.ripple} ${pulses.includes(`${code}:paid`) ? styles.pulse : ''}`}
                          />
                        )}
                        <circle cx={(x ?? 0) - 6} cy={y} r="5" fill="#48d6a1" />
                      </>
                    )}
                    {row.checkouts > 0 && (
                      <>
                        {animated && (
                          <circle
                            cx={(x ?? 0) + 6}
                            cy={y}
                            r="5"
                            fill="none"
                            stroke="#f2bb68"
                            className={`${styles.ripple} ${pulses.includes(`${code}:checkout`) ? styles.pulse : ''}`}
                          />
                        )}
                        <circle cx={(x ?? 0) + 6} cy={y} r="5" fill="#f2bb68" />
                      </>
                    )}
                  </g>
                ) : null}
              </g>
            );
          })}
        </svg>
        {(loading || failed || !offerIds.length) && (
          <p className={styles.overlay}>
            {loading
              ? 'Consultando países…'
              : failed
                ? 'Dados indisponíveis. Nenhum ponto ilustrativo é exibido.'
                : 'Nenhuma oferta selecionada.'}
          </p>
        )}
      </div>
      <div className={styles.detail} aria-live="polite">
        {picked ? (
          <>
            <strong>{name(picked.country)}</strong> · {picked.paid_orders} compras ·{' '}
            {picked.checkouts} checkouts
          </>
        ) : (
          'Passe o mouse, toque ou use Tab nos pontos para ver o país.'
        )}
      </div>
    </section>
  );
}
