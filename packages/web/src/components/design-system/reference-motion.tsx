'use client';

import { Button } from '@/components/ui/button';
import { interpolateCount } from '@/lib/motion-session';
import { formatCurrency as money } from '@/lib/number-format';
import { ArrowDown, ArrowUp, Eye, EyeOff, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import styles from './reference.module.css';

/** Isolado na referência: ainda não altera a política do useCountUp de produção. */
export function useReferenceNumber(
  target: number,
  enabled: boolean,
  privateMode: boolean,
  replay: number,
) {
  const [display, setDisplay] = useState(target);
  const visible = useRef(0);
  const visit = useRef(replay);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let start: number | undefined;
    if (visit.current !== replay) visible.current = 0;
    visit.current = replay;
    const from = visible.current;
    const finish = () => {
      cancelAnimationFrame(frame);
      visible.current = target;
      setDisplay(target);
    };
    const tick = (time: number) => {
      if (media.matches || !enabled || privateMode || document.hidden) return finish();
      start ??= time;
      const progress = Math.min(1, (time - start) / 1650);
      const value = interpolateCount(from, target, progress);
      visible.current = value;
      setDisplay(value);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    const preference = () => {
      if (media.matches || document.hidden) finish();
    };
    if (!enabled || privateMode || media.matches || from === target) finish();
    else {
      setDisplay(from);
      frame = requestAnimationFrame(tick);
    }
    media.addEventListener('change', preference);
    document.addEventListener('visibilitychange', preference);
    return () => {
      cancelAnimationFrame(frame);
      media.removeEventListener('change', preference);
      document.removeEventListener('visibilitychange', preference);
    };
  }, [target, enabled, privateMode, replay]);

  return display;
}

export function NumberSpecimen({ motion }: { motion: boolean }) {
  const [target, setTarget] = useState(3130.34);
  const [privateMode, setPrivateMode] = useState(false);
  const [replay, setReplay] = useState(0);
  const number = useReferenceNumber(target, motion, privateMode, replay);
  const improvement = target >= 3130.34;

  return (
    <div className={styles.numberSpecimen}>
      <div className={styles.labelRow}>
        <span>Receita bruta · exemplo</span>
        <Button
          variant="ghost"
          size="icon"
          className={styles.iconButton}
          aria-label={privateMode ? 'Revelar valores do exemplo' : 'Ocultar valores do exemplo'}
          aria-pressed={privateMode}
          onClick={() => setPrivateMode(!privateMode)}
        >
          {privateMode ? <EyeOff /> : <Eye />}
        </Button>
      </div>
      <p className={styles.bigNumber}>
        <span className={styles.srOnly}>{privateMode ? 'Valores ocultos' : money(target)}</span>
        <span aria-hidden="true">{privateMode ? '••••' : money(number)}</span>
      </p>
      <p className={styles.delta} data-tone={improvement ? 'positive' : 'negative'}>
        {improvement ? <ArrowUp aria-hidden /> : <ArrowDown aria-hidden />}
        <strong>{privateMode ? '••••' : improvement ? '+9,8%' : '−5,2%'}</strong>
        <span>vs. período anterior · fictício</span>
      </p>
      <div className={styles.row}>
        <Button variant="outline" className={styles.secondary} onClick={() => setTarget(4810.56)}>
          Aumentar
        </Button>
        <Button variant="outline" className={styles.secondary} onClick={() => setTarget(2480.2)}>
          Diminuir
        </Button>
        <Button
          variant="ghost"
          className={styles.secondary}
          onClick={() => setReplay((value) => value + 1)}
        >
          <RotateCcw aria-hidden /> Repetir entrada
        </Button>
      </div>
      <p className={styles.caption}>
        Entrada do zero; filtros partem do valor visível. Sem contagem quando os valores estão
        ocultos.
      </p>
    </div>
  );
}
