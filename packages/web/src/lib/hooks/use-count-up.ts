'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { claimMotionEntrance, interpolateCount, motionScreenKey } from '../motion-session';
import { getSessionGeneration } from '../session-data';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export function useCountUp(
  value: number | undefined,
  duration = 800,
  identity?: string,
): number | undefined {
  const [displayValue, setDisplayValue] = useState<number | undefined>(value);
  const current = useRef<number | undefined>(undefined);

  useLayoutEffect(() => {
    if (value === undefined || !Number.isFinite(value)) {
      setDisplayValue(undefined);
      current.current = undefined;
      return;
    }

    const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);
    let animationFrame = 0;
    let startTime: number | undefined;
    const page = motionScreenKey(
      window.location.pathname,
      new URLSearchParams(window.location.search),
    );
    const firstVisit = identity
      ? claimMotionEntrance(`${getSessionGeneration()}:${page}:count:${identity}`)
      : current.current === undefined;
    const from = current.current ?? (firstVisit ? 0 : value);
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
      startTime ??= time;
      // Initial reveal may be expressive; live updates remain short and never reset to zero.
      const elapsed = firstVisit ? duration : Math.min(duration, 240);
      const progress = Math.min((time - startTime) / Math.max(elapsed, 100), 1);
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
  }, [duration, identity, value]);

  // Disabling countUp must not leave the previous financial reading in the rendered output.
  return value === undefined || !Number.isFinite(value) ? undefined : displayValue;
}
