import { SCREEN_TRANSITION } from './screen-transition';

export function motionScreenKey(pathname: string, search: Pick<URLSearchParams, 'get'>): string {
  return [pathname, search.get('view') ?? '', search.get('section') ?? '', search.get('tab') ?? '']
    .map(encodeURIComponent)
    .join(':');
}

export const PANEL_ENTRANCE = {
  duration: SCREEN_TRANSITION.enter,
  stagger: SCREEN_TRANSITION.stagger,
  maxPanels: 12,
} as const;

export function interpolateCount(from: number, to: number, progress: number): number {
  const bounded = Math.max(0, Math.min(1, progress));
  return bounded === 1 ? to : from + (to - from) * (1 - (1 - bounded) ** 5);
}
