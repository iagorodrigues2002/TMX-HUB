const visitedScreens = new Set<string>();
const routeSession = { current: null as string | null, visited: new Set<string>() };

/** Only UI identities live here: no values, people or business data are retained. */
export function claimMotionEntrance(key: string, visited = visitedScreens): boolean {
  if (visited.has(key)) return false;
  visited.add(key);
  return true;
}

export function motionScreenKey(pathname: string, search: Pick<URLSearchParams, 'get'>): string {
  return [pathname, search.get('view') ?? '', search.get('section') ?? '', search.get('tab') ?? '']
    .map(encodeURIComponent)
    .join(':');
}

export const PANEL_ENTRANCE = {
  duration: 440,
  stagger: 42,
  maxPanels: 6,
  easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
} as const;

export function isRouteTransition(previous: string | null, next: string): boolean {
  return previous !== null && previous !== next;
}

/** HubShell remounts per route; retain only screen identities across those mounts. */
export function visitMotionScreen(key: string, session = routeSession) {
  const navigating = isRouteTransition(session.current, key);
  const firstVisit = claimMotionEntrance(key, session.visited);
  session.current = key;
  return { navigating, firstVisit };
}

export const ROUTE_TRANSITION = {
  duration: 220,
  easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
} as const;

export const ROUTE_TRANSITION_FRAMES: Keyframe[] = [{ opacity: 0.65 }, { opacity: 1 }];

export function panelEntranceFrames(fullBleed = false): Keyframe[] {
  return [
    { opacity: 0.45, transform: fullBleed ? 'none' : 'translate3d(0, 18px, 0)' },
    { opacity: 1, transform: fullBleed ? 'none' : 'translate3d(0, 0, 0)' },
  ];
}

export function interpolateCount(from: number, to: number, progress: number): number {
  const bounded = Math.max(0, Math.min(1, progress));
  return bounded === 1 ? to : from + (to - from) * (1 - (1 - bounded) ** 5);
}
