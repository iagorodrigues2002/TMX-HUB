'use client';

import { useRouter as useNextRouter } from 'next/navigation';
import { useMemo } from 'react';
import { prepareRouteTransition } from './route-snapshot';

/** Capture before programmatic navigation; Next still owns history, focus and routing. */
export function useRouter(): ReturnType<typeof useNextRouter> {
  const router = useNextRouter();
  return useMemo<ReturnType<typeof useNextRouter>>(
    () => ({
      ...router,
      push: (href, options) => {
        prepareRouteTransition(href);
        router.push(href, options);
      },
      replace: (href, options) => {
        prepareRouteTransition(href);
        router.replace(href, options);
      },
      back: () => {
        prepareRouteTransition();
        router.back();
      },
      forward: () => {
        prepareRouteTransition();
        router.forward();
      },
    }),
    [router],
  );
}
