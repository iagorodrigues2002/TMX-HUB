'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import world from '@d3-maps/atlas/world/countries/countries-110m';
import { geoNaturalEarth1, geoPath } from 'd3-geo';
import type { FeatureCollection, Geometry } from 'geojson';
import countries from 'i18n-iso-countries';
import ptLocale from 'i18n-iso-countries/langs/pt.json';
import { AlertTriangle, List, Map as MapIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { feature } from 'topojson-client';

countries.registerLocale(ptLocale);

type CountryRow = {
  country: string;
  page_views: number;
  checkouts: number;
  orders: number;
  paid_orders: number;
  paid_revenue_minor: string;
};

type Metric = 'page_views' | 'checkouts' | 'paid_orders' | 'conversion_rate';

const metricLabels: Record<Metric, string> = {
  page_views: 'PageView',
  checkouts: 'Checkout',
  paid_orders: 'Venda',
  conversion_rate: 'Conversão',
};

const LOW_CONVERSION_THRESHOLD = 1;
const MIN_PAGE_VIEWS_FOR_ALERT = 20;

function conversionRate(row: CountryRow) {
  return row.page_views > 0 ? (row.paid_orders / row.page_views) * 100 : 0;
}

function hasLowConversion(row: CountryRow) {
  return (
    row.page_views >= MIN_PAGE_VIEWS_FOR_ALERT && conversionRate(row) < LOW_CONVERSION_THRESHOLD
  );
}

function metricValue(row: CountryRow, metric: Metric) {
  return metric === 'conversion_rate' ? conversionRate(row) : row[metric];
}

function formatMetric(value: number, metric: Metric) {
  return metric === 'conversion_rate'
    ? `${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
    : value.toLocaleString('pt-BR');
}

function countryName(code: string) {
  if (code === 'ZZ') return 'Não identificado';
  return countries.getName(code, 'pt') ?? code;
}

export function TrackingCountryMap({ rows }: { rows: CountryRow[] }) {
  const [metric, setMetric] = useState<Metric>('page_views');
  const [display, setDisplay] = useState<'map' | 'list'>('map');
  const [selected, setSelected] = useState<string | null>(null);

  const mapped = useMemo(
    () =>
      new Map(
        rows
          .filter((row) => row.country !== 'ZZ')
          .map((row) => [countries.alpha2ToAlpha3(row.country) ?? row.country, row]),
      ),
    [rows],
  );
  const total =
    metric === 'conversion_rate'
      ? (() => {
          const pageViews = rows.reduce((sum, row) => sum + row.page_views, 0);
          const paidOrders = rows.reduce((sum, row) => sum + row.paid_orders, 0);
          return pageViews > 0 ? (paidOrders / pageViews) * 100 : 0;
        })()
      : rows.reduce((sum, row) => sum + metricValue(row, metric), 0);
  const maximum = Math.max(1, ...rows.map((row) => metricValue(row, metric)));
  const ranking = [...rows].sort((a, b) => metricValue(b, metric) - metricValue(a, metric));
  const selectedRow = selected
    ? rows.find((row) => (countries.alpha2ToAlpha3(row.country) ?? row.country) === selected)
    : null;

  const geometry = useMemo(() => {
    const collection = feature(world, world.objects.features!) as FeatureCollection<Geometry>;
    const projection = geoNaturalEarth1().fitSize([960, 430], collection);
    return {
      features: collection.features,
      path: geoPath(projection),
    };
  }, []);

  return (
    <section className="rounded-xl border border-white/[0.08] bg-black/10 p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-white">Origem por país</h3>
          <p className="mt-1 text-xs text-white/40">
            {formatMetric(total, metric)} · {metricLabels[metric].toLowerCase()}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-lg border border-white/[0.08] bg-black/20 p-1">
            {(Object.keys(metricLabels) as Metric[]).map((key) => (
              <Button
                key={key}
                type="button"
                size="sm"
                variant="ghost"
                aria-pressed={metric === key}
                onClick={() => setMetric(key)}
                className={cn(
                  'text-white/45',
                  metric === key && 'bg-emerald-300 text-[#04140f] hover:bg-emerald-200',
                )}
              >
                {metricLabels[key]}
              </Button>
            ))}
          </div>
          <div className="flex rounded-lg border border-white/[0.08] bg-black/20 p-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Ver lista de países"
              aria-pressed={display === 'list'}
              onClick={() => setDisplay('list')}
              className={cn(display === 'list' && 'bg-white/[0.08] text-white')}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Ver mapa de países"
              aria-pressed={display === 'map'}
              onClick={() => setDisplay('map')}
              className={cn(display === 'map' && 'bg-emerald-300 text-[#04140f]')}
            >
              <MapIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {display === 'map' ? (
        <div className="mt-4 overflow-hidden rounded-xl border border-white/[0.08] bg-[#061116]">
          <svg
            viewBox="0 0 960 430"
            className="block h-auto w-full"
            role="img"
            aria-label={`Mapa mundial por ${metricLabels[metric]}`}
          >
            {geometry.features.map((country) => {
              const id = String(country.properties?.id ?? '');
              const row = mapped.get(id);
              const value = row ? metricValue(row, metric) : 0;
              const intensity = value ? 0.25 + 0.75 * Math.sqrt(value / maximum) : 0.08;
              const active = selected === id;
              const lowConversion = row ? hasLowConversion(row) : false;
              return (
                <path
                  key={id}
                  d={geometry.path(country) ?? undefined}
                  fill="currentColor"
                  stroke={lowConversion ? 'rgba(251,113,133,.95)' : 'rgba(6,17,22,.9)'}
                  strokeWidth={active || lowConversion ? 1.8 : 0.65}
                  className={cn(
                    'text-white transition hover:text-cyan-200',
                    value > 0 ? 'text-cyan-300' : 'text-white',
                    active && 'text-emerald-300',
                  )}
                  style={{ opacity: active ? 1 : intensity }}
                >
                  <title>
                    {countryName(row?.country ?? id)}: {formatMetric(value, metric)}{' '}
                    {metricLabels[metric]}
                    {metric !== 'conversion_rate' && (
                      <>
                        {' '}
                        · conversão{' '}
                        {row ? formatMetric(conversionRate(row), 'conversion_rate') : '0,00%'}
                      </>
                    )}
                    {lowConversion && ' · ALERTA: conversão baixa'}
                  </title>
                </path>
              );
            })}
          </svg>
        </div>
      ) : (
        <div className="mt-4 divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/[0.08]">
          <div className="grid grid-cols-[minmax(0,1fr)_90px_110px] gap-3 bg-white/[0.025] px-4 py-2 text-[10px] uppercase tracking-wider text-white/30">
            <span>País</span>
            <span className="text-right">{metricLabels[metric]}</span>
            <span className="text-right">Conversão</span>
          </div>
          {ranking.map((row) => (
            <button
              key={row.country}
              type="button"
              onClick={() => setSelected(countries.alpha2ToAlpha3(row.country) ?? row.country)}
              className="grid w-full grid-cols-[minmax(0,1fr)_90px_110px] items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03]"
            >
              <span className="flex items-center gap-2 text-sm text-white/70">
                {hasLowConversion(row) && (
                  <AlertTriangle
                    className="h-4 w-4 shrink-0 text-rose-400"
                    aria-label="Alerta de conversão baixa"
                  />
                )}
                {countryName(row.country)}
              </span>
              <span className="text-right font-mono text-sm text-cyan-200">
                {formatMetric(metricValue(row, metric), metric)}
              </span>
              <span className="text-right font-mono text-xs text-emerald-200">
                {formatMetric(conversionRate(row), 'conversion_rate')}
              </span>
            </button>
          ))}
        </div>
      )}

      {selectedRow && (
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg bg-white/[0.03] px-4 py-3 text-xs">
          <strong className="text-white/80">{countryName(selectedRow.country)}</strong>
          <span className="text-white/45">
            {selectedRow.page_views.toLocaleString('pt-BR')} pageviews
          </span>
          <span className="text-white/45">
            {selectedRow.checkouts.toLocaleString('pt-BR')} checkouts
          </span>
          <span className="text-emerald-200">
            {selectedRow.paid_orders.toLocaleString('pt-BR')} vendas
          </span>
          <span className="rounded-full border border-emerald-300/20 bg-emerald-300/[0.07] px-2.5 py-1 font-mono text-emerald-200">
            {formatMetric(conversionRate(selectedRow), 'conversion_rate')} de conversão
          </span>
          {hasLowConversion(selectedRow) && (
            <span className="flex items-center gap-1.5 rounded-full border border-rose-300/25 bg-rose-300/[0.08] px-2.5 py-1 font-medium text-rose-200">
              <AlertTriangle className="h-3.5 w-3.5" /> Conversão baixa
            </span>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center gap-3 text-[10px] uppercase tracking-wider text-white/30">
        <span>menos</span>
        <span className="h-2 w-36 rounded-full bg-gradient-to-r from-cyan-900 via-cyan-500 to-emerald-300" />
        <span>mais</span>
        <span className="flex items-center gap-1 text-rose-300/70">
          <AlertTriangle className="h-3 w-3" /> alerta abaixo de 1% após 20 pageviews
        </span>
        {rows.some((row) => row.country === 'ZZ') && (
          <span className="ml-auto">
            {formatMetric(
              rows.find((row) => row.country === 'ZZ')
                ? metricValue(rows.find((row) => row.country === 'ZZ')!, metric)
                : 0,
              metric,
            )}{' '}
            sem país
          </span>
        )}
      </div>
    </section>
  );
}
