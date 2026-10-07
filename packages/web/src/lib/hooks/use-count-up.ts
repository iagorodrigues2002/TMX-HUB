'use client';

import { useLayoutEffect, useState } from 'react';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export function useCountUp(value: number | undefined, duration = 800): number | undefined {
  const [displayValue, setDisplayValue] = useState<number | undefined>(() =>
    value === undefined ? undefined : 0,
  );

  useLayoutEffect(() => {
    if (value === undefined || !Number.isFinite(value)) {
      setDisplayValue(undefined);
      return;
    }

    const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);
    if (mediaQuery.matches) {
      setDisplayValue(value);
      return;
    }

    let animationFrame = 0;
    let startTime: number | undefined;

    setDisplayValue(0);

    const finishAnimation = () => {
      cancelAnimationFrame(animationFrame);
      setDisplayValue(value);
    };

    const tick = (time: number) => {
      startTime ??= time;
      const progress = Math.min((time - startTime) / Math.max(duration, 100), 1);
      const easedProgress = 1 - (1 - progress) ** 3;

      setDisplayValue(value * easedProgress);

      if (progress < 1) {
        animationFrame = requestAnimationFrame(tick);
      }
    };

    const handleMotionPreference = (event: MediaQueryListEvent) => {
      if (event.matches) finishAnimation();
    };

    mediaQuery.addEventListener('change', handleMotionPreference);
    animationFrame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animationFrame);
      mediaQuery.removeEventListener('change', handleMotionPreference);
    };
  }, [duration, value]);

  return displayValue;
}
