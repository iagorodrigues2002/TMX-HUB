'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { interpolateCount } from '@/lib/motion-session';
import { ArrowRight, Check, CreditCard, MousePointer2, Pause, Play } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { hourlyCeiling, hourlyGeometry, hourlySamples } from './reference-chart';
import geometry from './reference-map.json';
import styles from './reference.module.css';

function useActivity(motion: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let visible = false;
    const sync = () => {
      setReduced(media.matches || !motion);
      setActive(visible && !document.hidden && motion && !media.matches);
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false;
      sync();
    });
    if (ref.current) observer.observe(ref.current);
    sync();
    media.addEventListener('change', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      observer.disconnect();
      media.removeEventListener('change', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [motion]);
  return { ref, active, reduced };
}

export function MapSpecimen({ motion }: { motion: boolean }) {
  const { ref, active } = useActivity(motion);
  const [paused, setPaused] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const point = geometry.points.find((item) => item.iso === selected);
  return (
    <Card className={styles.surface}>
      <CardHeader>
        <CardTitle>Mapa de atividade global</CardTitle>
        <CardDescription>
          Pulsos escalonados de 3,8s. Seleção por mouse, toque ou teclado; ao sair, o país é
          desmarcado.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          className={styles.secondary}
          variant="outline"
          aria-pressed={paused}
          onClick={() => setPaused(!paused)}
        >
          {paused ? <Play aria-hidden /> : <Pause aria-hidden />}{' '}
          {paused ? 'Retomar mapa' : 'Pausar mapa'}
        </Button>
        <div
          ref={ref}
          className={styles.mapExample}
          data-active={active && !paused}
          onMouseLeave={() => setSelected(null)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setSelected(null);
          }}
        >
          <svg viewBox="0 0 900 430" aria-hidden="true">
            <path d={geometry.grid} className={styles.mapGrid} />
            {geometry.countries.map((country) => (
              <path
                key={country.iso}
                d={country.path}
                className={styles.mapCountry}
                data-selected={country.iso === selected}
              />
            ))}
          </svg>
          {geometry.points.map((item, index) => (
            <button
              key={item.iso}
              type="button"
              className={styles.mapPoint}
              style={{
                left: `${(item.xy[0] ?? 0) / 9}%`,
                top: `${(item.xy[1] ?? 0) / 4.3}%`,
                animationDelay: `${-index * 0.47}s`,
              }}
              aria-label={`${item.name}: ${item.paid} compras e ${item.checks} checkouts fictícios`}
              aria-pressed={selected === item.iso}
              onMouseEnter={() => setSelected(item.iso)}
              onFocus={() => setSelected(item.iso)}
              onClick={() => setSelected(item.iso)}
            >
              <span className={styles.mapRing} />
              <span className={styles.mapDot} />
            </button>
          ))}
        </div>
        <p className={styles.caption} aria-live="polite">
          {point
            ? `${point.name} · ${point.paid} compras · ${point.checks} checkouts`
            : 'Explore os 8 países destacados · dados fictícios'}
        </p>
        <p className={styles.caption}>
          Pausa fora da área visível. Pulsos ilustram atividade; não representam novas vendas em
          tempo real.
        </p>
      </CardContent>
    </Card>
  );
}

export function ChartSpecimen({ motion }: { motion: boolean }) {
  const { ref, active, reduced } = useActivity(motion);
  const gradient = useId();
  const [view, setView] = useState<0 | 1>(0);
  const [filter, setFilter] = useState<'Todos' | 'Fronts' | 'Upsells'>('Todos');
  const [plot, setPlot] = useState({
    values: hourlySamples[0],
    ceiling: hourlyCeiling(hourlySamples[0]),
  });
  const [width, setWidth] = useState(600);
  const current = useRef(plot);
  const hits = useRef<(HTMLButtonElement | null)[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(260, Math.round(entry.contentRect.width)));
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref]);
  useEffect(() => {
    const values = hourlySamples[view].map(
      (value) => value * (filter === 'Todos' ? 1 : filter === 'Fronts' ? 0.68 : 0.32),
    );
    const target = { values, ceiling: hourlyCeiling(values) };
    const from = current.current;
    let frame = 0;
    let start: number | undefined;
    const update = (next: typeof target) => {
      current.current = next;
      setPlot(next);
    };
    if (reduced || !active) {
      update(target);
      return;
    }
    const tick = (time: number) => {
      start ??= time;
      const progress = Math.min(1, (time - start) / 950);
      update({
        values: target.values.map((value, index) =>
          interpolateCount(from.values[index] ?? value, value, progress),
        ),
        ceiling: interpolateCount(from.ceiling, target.ceiling, progress),
      });
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [view, filter, reduced, active]);
  const height = width < 400 ? 245 : 285;
  const chart = hourlyGeometry(plot.values, width, height, plot.ceiling);
  const focus = selected === null ? null : chart.points[selected];
  const peak = chart.points.reduce(
    (best, point) => (!best || point.value > best.value ? point : best),
    chart.points[0],
  );
  const money = (value: number) =>
    value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  return (
    <Card className={styles.surface}>
      <CardHeader>
        <CardTitle>Receita por hora</CardTitle>
        <CardDescription>
          Primeiro webhook aprovado · horário de São Paulo. Reenvios não somam novamente.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className={styles.row}>
          <Button
            className={styles.secondary}
            variant="outline"
            onClick={() => setView(view === 0 ? 1 : 0)}
          >
            Visão: {view ? 'Natural' : 'Geral'}
          </Button>
          {(['Todos', 'Fronts', 'Upsells'] as const).map((value) => (
            <Button
              key={value}
              className={filter === value ? styles.primary : styles.secondary}
              variant="outline"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {value}
            </Button>
          ))}
        </div>
        <p className={styles.chartTotal}>
          Total no período{' '}
          <strong>{money(plot.values.reduce((sum, value) => sum + value, 0))}</strong>
          <span>Dados fictícios</span>
        </p>
        <div
          ref={ref}
          className={styles.chartExample}
          onPointerLeave={() => setSelected(null)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setSelected(null);
          }}
        >
          <svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
            <title>Receita por hora · amostra demonstrativa</title>
            <defs>
              <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
                <stop stopColor="currentColor" stopOpacity="0.23" />
                <stop offset="1" stopColor="currentColor" stopOpacity="0.01" />
              </linearGradient>
            </defs>
            {[0, 1, 2, 3, 4].map((index) => (
              <path
                key={index}
                d={`M64 ${30 + ((height - 68) * index) / 4}H${width - 18}`}
                className={styles.chartGrid}
              />
            ))}
            <path d={chart.area} fill={`url(#${gradient})`} />
            <path d={chart.line} className={styles.chartLine} />
            {chart.points.map((point) => (
              <circle
                key={point.hour}
                cx={point.x}
                cy={point.y}
                r={point.hour === selected ? 5 : 2.5}
                className={styles.chartDot}
              />
            ))}
            {(width < 400 ? [0, 6, 12, 18, 23] : [0, 3, 6, 9, 12, 15, 18, 21, 23]).map((hour) => (
              <text
                key={hour}
                x={64 + (hour * (width - 82)) / 23}
                y={height - 13}
                textAnchor="middle"
              >
                {String(hour).padStart(2, '0')}:00
              </text>
            ))}
            {peak && (
              <text x={Math.min(width - 80, peak.x + 10)} y={Math.max(16, peak.y - 12)}>
                Pico · {String(peak.hour).padStart(2, '0')}h
              </text>
            )}
            {focus && (
              <g>
                <path d={`M${focus.x} 30V${height - 38}`} className={styles.chartGuide} />
                <circle cx={focus.x} cy={focus.y} r="4" className={styles.chartSelected} />
              </g>
            )}
          </svg>
          <div className={styles.chartYAxis} aria-hidden="true">
            {[0, 1, 2, 3, 4].map((index) => {
              const value = plot.ceiling * (1 - index / 4);
              return (
                <span
                  key={index}
                  style={{ top: `${((30 + ((height - 68) * index) / 4) / height) * 100}%` }}
                >
                  {value === 0
                    ? '0'
                    : `${(value / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`}
                </span>
              );
            })}
          </div>
          <div aria-label="Receita por hora: explore os pontos do gráfico">
            {chart.points.map((point) => (
              <button
                type="button"
                key={point.hour}
                ref={(element) => {
                  hits.current[point.hour] = element;
                }}
                className={styles.chartHit}
                style={{
                  left: `${(Math.max(64, point.x - (width - 82) / 46) / width) * 100}%`,
                  top: `${(30 / height) * 100}%`,
                  width: `${((width - 82) / 23 / width) * 100}%`,
                  height: `${((height - 68) / height) * 100}%`,
                }}
                aria-pressed={selected === point.hour}
                aria-label={`${point.hour}h: ${money(point.value)}`}
                onPointerEnter={() => setSelected(point.hour)}
                onFocus={() => setSelected(point.hour)}
                onClick={() => setSelected(point.hour)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setSelected(null);
                  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                    event.preventDefault();
                    hits.current[
                      (point.hour + (event.key === 'ArrowRight' ? 1 : 23)) % 24
                    ]?.focus();
                  }
                }}
              />
            ))}
          </div>
          {focus && (
            <output
              className={styles.chartTooltip}
              style={{
                left: `clamp(0px, calc(${(focus.x / width) * 100}% - 56px), calc(100% - 112px))`,
                top: `max(0px, calc(${(focus.y / height) * 100}% - 65px))`,
              }}
            >
              {String(focus.hour).padStart(2, '0')}:00 – {String(focus.hour).padStart(2, '0')}:59
              <strong>{money(focus.value)}</strong>
            </output>
          )}
        </div>
        <p className={styles.caption}>
          Receita (BRL) · Passe o mouse, toque ou use Tab nos horários. Dados demonstrativos.
        </p>
      </CardContent>
    </Card>
  );
}

export function FunnelSpecimen({ motion }: { motion: boolean }) {
  const { ref, active } = useActivity(motion);
  const [paused, setPaused] = useState(false);
  const stages = [
    { name: 'Entrada', value: '2.278', Icon: MousePointer2 },
    { name: 'Checkout', value: '124', Icon: CreditCard },
    { name: 'Compra', value: '18', Icon: Check },
  ];
  return (
    <Card className={styles.surface}>
      <CardHeader>
        <CardTitle>Entrada → Checkout → Compra</CardTitle>
        <CardDescription>
          Varredura discreta, ícones e setas em sequência. Ciclo de 6s, sem simular alteração de
          contagens.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          className={styles.secondary}
          variant="outline"
          aria-pressed={paused}
          onClick={() => setPaused(!paused)}
        >
          {paused ? <Play aria-hidden /> : <Pause aria-hidden />}
          {paused ? 'Retomar funil' : 'Pausar funil'}
        </Button>
        <div ref={ref} className={styles.funnelExample} data-active={active && !paused}>
          {stages.map(({ name, value, Icon }, index) => (
            <div key={name} className={styles.funnelGroup}>
              {index > 0 && (
                <ArrowRight
                  className={styles.funnelArrow}
                  aria-hidden
                  style={{ animationDelay: `${index * 1.3}s` }}
                />
              )}
              <div className={styles.funnelStep} style={{ animationDelay: `${index * 1.3}s` }}>
                <span className={styles.funnelSweep} />
                <span className={styles.funnelIcon}>
                  <Icon aria-hidden />
                </span>
                <span>
                  {name}
                  <strong>{value}</strong>
                </span>
              </div>
            </div>
          ))}
        </div>
        <p className={styles.caption}>
          Dados fictícios. Fluxo ilustrativo; mantém a leitura em pausa ou com movimento reduzido.
        </p>
      </CardContent>
    </Card>
  );
}
