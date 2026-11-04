'use client';

import { Button } from '@/components/ui/button';
import { SCREEN_TRANSITION } from '@/lib/screen-transition';
import { ArrowLeft, ArrowRight, Layers3 } from 'lucide-react';
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useReferenceNumber } from './reference-motion';
import { animateReferenceScreen, cancelReferenceTransition } from './reference-transition';
import styles from './reference.module.css';

type Screen = 'overview' | 'offers';

function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div data-dolly-panel className={`${styles.dollyPanel} ${className}`}>
      <div data-dolly-material className={styles.dollyMaterial} aria-hidden="true" />
      <div className={styles.dollyContent}>{children}</div>
    </div>
  );
}

function ScreenContent({
  screen,
  motion,
  active,
  visit,
  factor,
  onFilter,
}: {
  screen: Screen;
  motion: boolean;
  active: boolean;
  visit: number;
  factor: number;
  onFilter: () => void;
}) {
  const overview = screen === 'overview';
  const revenue = useReferenceNumber(
    (overview ? 3130.34 : 4785.43) * factor,
    motion && active,
    false,
    visit,
  );
  const sales = useReferenceNumber((overview ? 18 : 31) * factor, motion && active, false, visit);
  const metric = useReferenceNumber((overview ? 0.79 : 3) * factor, motion && active, false, visit);
  return (
    <>
      <Panel className={styles.dollyHeading}>
        <h3 tabIndex={-1} data-screen-heading>
          {overview ? 'Visão geral' : 'Ofertas'}
        </h3>
        <p>
          {overview ? 'Acompanhe os resultados da operação.' : 'Gerencie as ofertas da sua conta.'}
        </p>
        <Button className={styles.secondary} variant="outline" onClick={onFilter}>
          Período: {factor === 1 ? 'Hoje' : 'Ontem'}
        </Button>
      </Panel>
      <div className={styles.dollyMetrics}>
        <Panel>
          <span>Receita bruta</span>
          <span className={styles.dollyNumber} aria-hidden="true">
            {money(revenue)}
          </span>
          <span className={styles.srOnly}>{money((overview ? 3130.34 : 4785.43) * factor)}</span>
        </Panel>
        <Panel>
          <span>Vendas</span>
          <span className={styles.dollyNumber} aria-hidden="true">
            {Math.round(sales).toLocaleString('pt-BR')}
          </span>
          <span className={styles.srOnly}>{Math.round((overview ? 18 : 31) * factor)} vendas</span>
        </Panel>
        <Panel>
          <span>{overview ? 'Conversão' : 'Ofertas ativas'}</span>
          <span className={styles.dollyNumber} aria-hidden="true">
            {overview
              ? `${metric.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
              : Math.round(metric)}
          </span>
          <span className={styles.srOnly}>
            {overview
              ? `${(0.79 * factor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}% de conversão`
              : `${Math.round(3 * factor)} ofertas`}{' '}
            · valores demonstrativos
          </span>
        </Panel>
      </div>
      <Panel>
        <h4>{overview ? 'Receita por hora' : 'Catálogo de ofertas'}</h4>
        {overview ? (
          <div className={styles.dollyBars} aria-hidden="true">
            {[25, 74, 42, 90, 55, 35, 68, 82].map((height) => (
              <span key={height} style={{ height: `${height}%` }} />
            ))}
          </div>
        ) : (
          <div className={styles.dollyOfferList}>
            {['Aurora', 'Atlas', 'Horizon'].map((name) => (
              <span key={name}>
                <Layers3 aria-hidden />
                {name}
                <small>Oferta demonstrativa</small>
              </span>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}

const money = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function FullTransitionSpecimen({ motion }: { motion: boolean }) {
  const [screen, setScreen] = useState<Screen>('overview');
  const [requested, setRequested] = useState<Screen>('overview');
  const [leaving, setLeaving] = useState<Screen | null>(null);
  const [visits, setVisits] = useState({ overview: 0, offers: 0 });
  const [factors, setFactors] = useState({ overview: 1, offers: 1 });
  const [phase, setPhase] = useState<'idle' | 'leaving' | 'entering'>('entering');
  const [reduced, setReduced] = useState(false);
  const stages = useRef<Partial<Record<Screen, HTMLDivElement>>>({});
  const animations = useRef(new Set<Animation>());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const revision = useRef(0);
  const current = useRef<Screen>('overview');
  const destination = useRef<Screen>('overview');

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(
    () => () => {
      revision.current++;
      clearTimeout(timer.current);
      cancelReferenceTransition(animations.current);
    },
    [],
  );

  useLayoutEffect(() => {
    if (motion && !reduced) return;
    revision.current++;
    clearTimeout(timer.current);
    cancelReferenceTransition(animations.current);
    current.current = destination.current;
    setScreen(destination.current);
    setLeaving(null);
    setPhase('idle');
  }, [motion, reduced]);

  useLayoutEffect(() => {
    if (phase !== 'entering' || !motion || reduced) return;
    const stage = stages.current[screen];
    if (!stage) return;
    const id = revision.current;
    void animateReferenceScreen(stage, true, animations.current).then(() => {
      if (id !== revision.current) return;
      cancelReferenceTransition(animations.current);
      setLeaving(null);
      setPhase('idle');
      if (visits[screen] > 0)
        stage.querySelector<HTMLElement>('[data-screen-heading]')?.focus({ preventScroll: true });
    });
  }, [screen, visits, phase, motion, reduced]);

  const go = (next: Screen) => {
    if (next === destination.current) return;
    const id = ++revision.current;
    clearTimeout(timer.current);
    cancelReferenceTransition(animations.current);
    destination.current = next;
    setRequested(next);
    setLeaving(null);
    if (next === current.current) {
      setPhase('idle');
      return;
    }
    const outgoing = current.current;
    const stage = stages.current[outgoing];
    if (stage && motion && !reduced) void animateReferenceScreen(stage, false, animations.current);
    setPhase('leaving');
    const enter = () => {
      if (id !== revision.current) return;
      current.current = next;
      setLeaving(motion && !reduced ? outgoing : null);
      setScreen(next);
      setVisits((value) => ({ ...value, [next]: value[next] + 1 }));
      setPhase(motion && !reduced ? 'entering' : 'idle');
    };
    if (motion && !reduced) timer.current = setTimeout(enter, SCREEN_TRANSITION.overlap);
    else enter();
  };

  return (
    <div>
      <nav className={styles.row} aria-label="Telas da demonstração">
        <Button
          variant="outline"
          className={styles.secondary}
          aria-pressed={requested === 'overview'}
          onClick={() => go('overview')}
        >
          <ArrowLeft aria-hidden />
          Visão geral
        </Button>
        <Button
          variant="outline"
          className={styles.secondary}
          aria-pressed={requested === 'offers'}
          onClick={() => go('offers')}
        >
          Ofertas
          <ArrowRight aria-hidden />
        </Button>
      </nav>
      <p className={styles.caption}>
        Saída 0,8× → espera de {SCREEN_TRANSITION.overlap}ms → entrada 1,5× / 1,4× / 1×, com
        escalonamento e materiais separados.
      </p>
      <div className={styles.fullTransition} aria-label="Prévia da transição completa">
        {(['overview', 'offers'] as const)
          .filter((value) => value === screen || value === leaving)
          .map((value) => (
            <div
              key={value}
              ref={(node) => {
                if (node) stages.current[value] = node;
                else delete stages.current[value];
              }}
              className={styles.dollyScreen}
              data-outgoing={value !== screen}
              aria-hidden={value !== screen || undefined}
              inert={value !== screen || undefined}
            >
              <ScreenContent
                key={visits[value]}
                screen={value}
                active={value === screen}
                motion={motion && !reduced}
                visit={visits[value]}
                factor={factors[value]}
                onFilter={() =>
                  setFactors((previous) => ({
                    ...previous,
                    [value]: previous[value] === 1 ? 0.7 : 1,
                  }))
                }
              />
            </div>
          ))}
      </div>
      <output className={styles.caption}>
        {phase === 'idle'
          ? `${screen === 'overview' ? 'Visão geral' : 'Ofertas'} pronta · demonstração local`
          : 'Transição de telas em andamento'}
      </output>
      <p className={styles.caption}>
        Números do zero a cada entrada, inclusive na volta. Filtros preservados: contam do valor
        atual. Sem rotas reais ou dados de produção.
      </p>
    </div>
  );
}
