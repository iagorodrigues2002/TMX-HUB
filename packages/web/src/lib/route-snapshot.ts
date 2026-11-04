import { motionScreenKey } from './motion-session';
import { animateScreenPanels, cancelScreenAnimations } from './screen-transition';

type Snapshot = { key: string; generation: number; frame: HTMLDivElement; panels: HTMLElement[] };
let pending: Snapshot | undefined;
let discardTimer: ReturnType<typeof setTimeout> | undefined;
let pendingObserver: MutationObserver | undefined;
let stopOutgoing: (() => void) | undefined;
let outgoingDestination: { key: string; generation: number } | undefined;
let captureCurrent: (() => void) | undefined;

export function registerRouteCapture(capture: () => void) {
  captureCurrent = capture;
  return () => {
    if (captureCurrent === capture) captureCurrent = undefined;
  };
}

export function prepareRouteTransition(href?: string) {
  if (href) {
    let next: URL;
    try {
      next = new URL(href, window.location.href);
    } catch {
      return;
    }
    const current = new URL(window.location.href);
    if (
      next.origin !== current.origin ||
      motionScreenKey(next.pathname, next.searchParams) ===
        motionScreenKey(current.pathname, current.searchParams)
    )
      return;
  }
  captureCurrent?.();
}

export function routeSnapshotBounds(
  box: Pick<DOMRect, 'top' | 'left' | 'right' | 'bottom'>,
  viewport: Pick<DOMRect, 'top' | 'left' | 'right' | 'bottom'>,
  width: number,
  height: number,
) {
  const top = Math.max(0, box.top, viewport.top);
  const left = Math.max(0, box.left, viewport.left);
  return {
    top,
    left,
    width: Math.max(0, Math.min(box.right, viewport.right, width) - left),
    height: Math.max(0, Math.min(box.bottom, viewport.bottom, height) - top),
  };
}

/** Only inert DOM survives unmount; no second React tree, effects or API requests. */
export function captureRouteSnapshot(
  root: HTMLElement,
  panels: HTMLElement[],
  key: string,
  generation: number,
) {
  if (pending?.key === key && pending.generation === generation) return;
  const box = root.getBoundingClientRect();
  if (!box.width || !box.height) return;
  const bounds = routeSnapshotBounds(
    box,
    root.closest('main')?.getBoundingClientRect() ?? box,
    innerWidth,
    innerHeight,
  );
  if (!bounds.width || !bounds.height) return;
  clearRouteSnapshot();
  for (const panel of panels) panel.dataset.motionSnapshotPanel = '';
  const copy = root.cloneNode(true) as HTMLElement;
  for (const panel of panels) delete panel.dataset.motionSnapshotPanel;
  for (const node of [copy, ...copy.querySelectorAll<HTMLElement>('*')]) {
    const credential =
      node instanceof HTMLInputElement &&
      (node.type === 'password' ||
        ['current-password', 'new-password', 'one-time-code', 'username'].includes(
          node.autocomplete,
        ));
    node.removeAttribute('id');
    node.removeAttribute('autofocus');
    node.removeAttribute('name');
    if (credential && node instanceof HTMLInputElement) {
      node.value = '';
      node.removeAttribute('value');
    }
  }
  for (const node of copy.querySelectorAll('script, iframe, object, embed')) node.remove();
  const frame = document.createElement('div');
  frame.dataset.routeSnapshot = '';
  frame.setAttribute('aria-hidden', 'true');
  frame.inert = true;
  Object.assign(frame.style, {
    position: 'fixed',
    top: `${bounds.top}px`,
    left: `${bounds.left}px`,
    width: `${bounds.width}px`,
    height: `${bounds.height}px`,
    overflow: 'hidden',
    pointerEvents: 'none',
    zIndex: '30',
  });
  Object.assign(copy.style, { width: `${box.width}px`, margin: '0' });
  copy.style.position = 'relative';
  copy.style.top = `${box.top - bounds.top}px`;
  copy.style.left = `${box.left - bounds.left}px`;
  frame.append(copy);
  pending = {
    key,
    generation,
    frame,
    panels: copy.matches('[data-motion-snapshot-panel]')
      ? [copy]
      : Array.from(copy.querySelectorAll<HTMLElement>('[data-motion-snapshot-panel]')),
  };
  // A slow route can suspend between unmount and commit; abandoned navigation expires.
  discardTimer = setTimeout(clearRouteSnapshot, 5000);
  pendingObserver = new MutationObserver(clearRouteSnapshot);
  pendingObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-tmx-privacy', 'data-tmx-motion'],
  });
}

export function playRouteSnapshot(
  key: string,
  generation: number,
  surface: HTMLElement | null,
): boolean {
  const snapshot = pending;
  pending = undefined;
  clearTimeout(discardTimer);
  pendingObserver?.disconnect();
  if (!snapshot)
    return outgoingDestination?.key === key && outgoingDestination.generation === generation;
  if (!snapshot || snapshot.key === key || snapshot.generation !== generation) return false;
  stopOutgoing?.();
  const registry = new Set<Animation>();
  const stop = () => {
    snapshot.frame.remove();
    cancelScreenAnimations(registry);
    observer.disconnect();
    if (stopOutgoing === stop) {
      stopOutgoing = undefined;
      outgoingDestination = undefined;
    }
  };
  const observer = new MutationObserver(stop);
  // Purge the visual immediately if privacy or identity changes during navigation.
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-tmx-privacy', 'data-tmx-motion'],
  });
  snapshot.frame.style.zIndex = '0';
  (surface?.parentElement ?? document.body).append(snapshot.frame);
  stopOutgoing = stop;
  outgoingDestination = { key, generation };
  void animateScreenPanels(snapshot.frame, snapshot.panels, false, registry).then(stop);
  return true;
}

export function clearRouteSnapshot() {
  clearTimeout(discardTimer);
  pendingObserver?.disconnect();
  pending = undefined;
  stopOutgoing?.();
}
