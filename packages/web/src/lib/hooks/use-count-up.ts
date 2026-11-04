'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { useDataPending } from '../data-pending';
import { interpolateCount } from '../motion-session';
import { routeEntranceReadyAt } from '../screen-transition';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export function useCountUp(
  value: number | undefined,
  duration = 1650,
  identity?: string,
): number | undefined {
  const [displayValue, setDisplayValue] = useState<number | undefined>(value);
  const current = useRef<number | undefined>(undefined);
  const metric = useRef(identity);
  const pending = useDataPending();

  useLayoutEffect(() => {
    if (pending) return;
    if (metric.current !== identity) {
      metric.current = identity;
      current.current = undefined;
    }
    if (value === undefined || !Number.isFinite(value)) {
      setDisplayValue(undefined);
      current.current = undefined;
      return;
    }

    const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);
    let animationFrame = 0;
    let startTime: number | undefined;
    const from = current.current ?? 0;
    const entering = current.current === undefined;
    const setValue = (next: number) => {
      current.current = next;
      setDisplayValue(next);
    };
    const canAnimate = () =>
      !mediaQuery.matches &&
      !document.hidden &&
      document.documentElement.dataset.tmxMotion !== 'off' &&
      document.documentElement.dataset.tmxPrivacy !== 'on';

    const finishAnimation = () => {
      cancelAnimationFrame(animationFrame);
      setValue(value);
    };

    const tick = (time: number) => {
      if (!canAnimate()) return finishAnimation();
      startTime ??= entering ? Math.max(time, routeEntranceReadyAt()) : time;
      const progress = Math.max(0, Math.min((time - startTime) / Math.max(duration, 100), 1));
      setValue(interpolateCount(from, value, progress));

      if (progress < 1) {
        animationFrame = requestAnimationFrame(tick);
      }
    };

    const handleMotionPreference = () => {
      if (!canAnimate()) finishAnimation();
    };

    if (!canAnimate() || from === value) {
      finishAnimation();
      return;
    }
    setValue(from);
    const observer = new MutationObserver(handleMotionPreference);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-tmx-motion', 'data-tmx-privacy'],
    });
    mediaQuery.addEventListener('change', handleMotionPreference);
    document.addEventListener('visibilitychange', handleMotionPreference);
    animationFrame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
      mediaQuery.removeEventListener('change', handleMotionPreference);
      document.removeEventListener('visibilitychange', handleMotionPreference);
    };
  }, [duration, identity, value, pending]);

  // Disabling countUp must not leave the previous financial reading in the rendered output.
  return value === undefined || !Number.isFinite(value) ? undefined : displayValue;
}
