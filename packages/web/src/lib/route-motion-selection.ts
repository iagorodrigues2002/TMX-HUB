export function isVisible(element: HTMLElement) {
  return !element.closest('[hidden], [aria-hidden="true"], [data-state="inactive"]');
}

function visibleSiblings(candidates: HTMLElement[]) {
  const visible = candidates.filter(isVisible);
  return visible.filter(
    (element) => !visible.some((other) => other !== element && other.contains(element)),
  );
}

/** Choose siblings, never both a surface and one of its descendants. */
export function routeEntrancePanels(scope: HTMLElement): HTMLElement[] {
  const explicit = Array.from(scope.querySelectorAll<HTMLElement>('[data-motion-panel]'));
  const surfaces = Array.from(
    scope.querySelectorAll<HTMLElement>('.glass-card, .tmx-kpi-card, .tool-card, .surface-panel'),
  );
  const copy = Array.from(scope.querySelectorAll<HTMLElement>('header, footer, header ~ p'));
  const candidates =
    explicit.length || surfaces.length
      ? [...new Set([...explicit, ...surfaces, ...copy])]
      : Array.from(scope.querySelectorAll<HTMLElement>('section'));
  candidates.sort((a, b) =>
    typeof a.compareDocumentPosition === 'function'
      ? a.compareDocumentPosition(b) & 4
        ? -1
        : 1
      : 0,
  );
  const topLevel = visibleSiblings(candidates);
  return topLevel.length ? topLevel : [scope];
}

export function routeEntranceScreens(scope: HTMLElement): HTMLElement[] {
  return visibleSiblings(
    scope.matches('[data-motion-screen]')
      ? [scope]
      : Array.from(scope.querySelectorAll<HTMLElement>('[data-motion-screen]')),
  );
}

export function routeAddedPanels(
  scope: HTMLElement,
  added: HTMLElement[],
  animated: WeakSet<HTMLElement>,
  scheduled: Iterable<HTMLElement>,
): HTMLElement[] {
  const waiting = [...scheduled];
  return routeEntrancePanels(scope).filter(
    (panel) =>
      !animated.has(panel) &&
      !panel.closest('[data-overview-loading="true"]') &&
      added.some((node) => node === panel || node.contains(panel)) &&
      !waiting.some((parent) => parent === panel || parent.contains(panel)),
  );
}

export function isActiveMotionTab(scope: Pick<HTMLElement, 'getAttribute'>): boolean {
  return scope.getAttribute('role') === 'tabpanel' && scope.getAttribute('data-state') === 'active';
}
