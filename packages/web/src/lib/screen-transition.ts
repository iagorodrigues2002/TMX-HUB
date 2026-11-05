/** Shared motion budget: even a long page finishes entering within 300ms. */
export const SCREEN_TRANSITION = { enter: 220, exit: 140, stagger: 16 } as const;
let entranceReadyAt = 0;
export function setRouteEntranceDelay(delay: number) {
  entranceReadyAt = performance.now() + delay;
}
export function routeEntranceReadyAt() {
  return entranceReadyAt;
}

export function cancelScreenAnimations(registry: Set<Animation>) {
  for (const animation of registry) animation.cancel();
  registry.clear();
}

export function animateScreenPanels(
  stage: HTMLElement,
  panels: HTMLElement[],
  entering: boolean,
  registry: Set<Animation>,
) {
  if (typeof stage.animate !== 'function') return Promise.resolve();
  const animations = panels.map((panel, index) => {
    const animation = panel.animate(
      entering
        ? [
            { opacity: 0, transform: 'translateY(8px)' },
            { opacity: 1, transform: 'none' },
          ]
        : [
            { opacity: 1, transform: 'none' },
            { opacity: 0, transform: 'translateY(-4px)' },
          ],
      {
        duration: entering ? SCREEN_TRANSITION.enter : SCREEN_TRANSITION.exit,
        delay: entering ? Math.min(index * SCREEN_TRANSITION.stagger, 80) : 0,
        easing: 'cubic-bezier(.22,1,.36,1)',
        fill: 'both',
      },
    );
    registry.add(animation);
    return animation.finished
      .catch(() => {})
      .then(() => {
        animation.cancel();
        registry.delete(animation);
      });
  });
  return Promise.all(animations).then(() => {});
}
