/** Shared by the approved preview and every real route. */
export const SCREEN_TRANSITION = { enter: 480, exit: 300, overlap: 150, stagger: 35 } as const;
const materialRestores = new WeakMap<Set<Animation>, Set<() => void>>();
let entranceReadyAt = 0;
export function setRouteEntranceDelay(delay: number) {
  entranceReadyAt = performance.now() + delay;
}
export function routeEntranceReadyAt() {
  return entranceReadyAt;
}

export function cancelScreenAnimations(registry: Set<Animation>) {
  for (const restore of [...(materialRestores.get(registry) ?? [])].reverse()) restore();
  materialRestores.delete(registry);
  for (const animation of registry) animation.cancel();
  registry.clear();
}

function prepareMaterial(panel: HTMLElement) {
  const existing = panel.querySelector<HTMLElement>(':scope > [data-dolly-material]');
  if (existing) return { material: existing, mount: () => {}, restore: () => {} };
  const computed = getComputedStyle(panel);
  const needsPosition = computed.position === 'static';
  const material = document.createElement('div');
  material.dataset.dollyMaterial = '';
  material.setAttribute('aria-hidden', 'true');
  Object.assign(material.style, {
    position: 'absolute',
    inset: `-${computed.borderTopWidth}`,
    pointerEvents: 'none',
    zIndex: '-1',
    borderRadius: computed.borderRadius,
    background: computed.background,
    border: computed.border,
    borderTop: computed.borderTop,
    borderRight: computed.borderRight,
    borderBottom: computed.borderBottom,
    borderLeft: computed.borderLeft,
    boxShadow: computed.boxShadow,
    backdropFilter: computed.backdropFilter,
    webkitBackdropFilter: computed.getPropertyValue('-webkit-backdrop-filter'),
  });
  const saved = new Map<string, { value: string; priority: string; temporary: string }>();
  const replace = (property: string, value: string) => {
    saved.set(property, {
      value: panel.style.getPropertyValue(property),
      priority: panel.style.getPropertyPriority(property),
      temporary: value,
    });
    panel.style.setProperty(property, value, 'important');
  };
  return {
    material,
    mount: () => {
      if (needsPosition) replace('position', 'relative');
      replace('isolation', 'isolate');
      replace('background', 'transparent');
      replace('border-color', 'transparent');
      replace('box-shadow', 'none');
      replace('backdrop-filter', 'none');
      replace('-webkit-backdrop-filter', 'none');
      panel.prepend(material);
    },
    restore: () => {
      material.remove();
      for (const [property, entry] of saved) {
        if (panel.style.getPropertyValue(property) !== entry.temporary) continue;
        if (entry.value) panel.style.setProperty(property, entry.value, entry.priority);
        else panel.style.removeProperty(property);
      }
    },
  };
}

export function animateScreenPanels(
  stage: HTMLElement,
  panels: HTMLElement[],
  entering: boolean,
  registry: Set<Animation>,
  entranceDelay = 0,
) {
  if (typeof stage.animate !== 'function') return Promise.resolve();
  const stageBox = stage.parentElement?.getBoundingClientRect() ?? stage.getBoundingClientRect();
  const centerX =
    typeof window === 'undefined' ? stageBox.left + stageBox.width / 2 : window.innerWidth / 2;
  const centerY =
    typeof window === 'undefined' ? stageBox.top + stageBox.height / 2 : window.innerHeight / 2;
  const promises: Promise<unknown>[] = [];
  const restores: (() => void)[] = [];
  const position = stage.style.position;
  const zIndex = stage.style.zIndex;
  const needsPosition = getComputedStyle(stage).position === 'static';
  // Read connected geometry/materials together; detached material preparation does not invalidate layout.
  const measured = panels.map((panel) => {
    const kind =
      panel.dataset?.motionKind ?? (panel.matches?.('header, footer, p') ? 'text' : undefined);
    return {
      panel,
      kind,
      box: panel.getBoundingClientRect(),
      separated: kind === 'text' || kind === 'chrome' ? undefined : prepareMaterial(panel),
    };
  });
  if (needsPosition) stage.style.position = 'relative';
  stage.style.zIndex = '1';
  restores.push(() => {
    stage.style.position = position;
    stage.style.zIndex = zIndex;
  });
  const run = (element: Element, frames: Keyframe[], options: KeyframeAnimationOptions) => {
    const animation = element.animate(frames, { ...options, fill: 'both' });
    registry.add(animation);
    promises.push(animation.finished.catch(() => {}));
  };
  for (const [index, { panel, box, kind, separated }] of measured.entries()) {
    const origin = panel.style.transformOrigin;
    panel.style.transformOrigin = `${centerX - box.left}px ${centerY - box.top}px`;
    restores.push(() => {
      panel.style.transformOrigin = origin;
    });
    const delay = entering
      ? entranceDelay + index * SCREEN_TRANSITION.stagger
      : Math.min(index, 6) * SCREEN_TRANSITION.stagger * 0.8;
    if (kind === 'text' || kind === 'chrome') {
      panel.style.transformOrigin = kind === 'text' ? '0 50%' : '50% 50%';
      run(
        panel,
        entering
          ? [
              {
                opacity: 0,
                transform: `scale(${kind === 'text' ? 1.18 : 1.3})`,
                filter: kind === 'text' ? 'blur(14px)' : 'none',
              },
              { opacity: 1, transform: 'none', filter: 'blur(0px)' },
            ]
          : kind === 'text'
            ? [
                { opacity: 1, filter: 'blur(0px)' },
                { opacity: 0, filter: 'blur(14px)', offset: 0.4 },
                { opacity: 0, filter: 'blur(14px)' },
              ]
            : [
                { opacity: 1, transform: 'none' },
                { opacity: 0, transform: 'scale(.85)' },
              ],
        {
          duration: entering
            ? SCREEN_TRANSITION.enter * (kind === 'text' ? 1 : 0.9)
            : SCREEN_TRANSITION.exit,
          delay,
          easing: entering ? 'cubic-bezier(.16,1,.3,1)' : 'ease',
        },
      );
      continue;
    }
    run(
      panel,
      entering
        ? [
            { transform: 'scale(1.5)', offset: 0, easing: 'cubic-bezier(.3,.6,.6,1)' },
            { transform: 'scale(1.4)', offset: 0.24, easing: 'cubic-bezier(.2,.75,.15,1)' },
            { transform: 'none', offset: 1 },
          ]
        : [{ transform: 'none' }, { transform: 'scale(.8)' }],
      {
        duration: entering ? SCREEN_TRANSITION.enter : SCREEN_TRANSITION.exit,
        delay,
        easing: entering ? 'linear' : 'cubic-bezier(.55,0,.75,.2)',
      },
    );
    if (!separated) continue;
    const { material, mount, restore } = separated;
    mount();
    restores.push(restore);
    run(material, entering ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }], {
      duration: entering ? SCREEN_TRANSITION.enter * 0.9 : SCREEN_TRANSITION.exit,
      delay: delay + (entering ? SCREEN_TRANSITION.enter * 0.2 : SCREEN_TRANSITION.exit * 0.12),
      easing: entering ? 'cubic-bezier(.22,1,.36,1)' : 'ease',
    });
    for (const child of panel.children) {
      if (child === material) continue;
      run(
        child,
        entering
          ? [
              { opacity: 0, filter: 'blur(12px)', offset: 0 },
              { opacity: 0, filter: 'blur(5px)', offset: 0.24 },
              { opacity: 1, filter: 'blur(0px)', offset: 0.7 },
              { opacity: 1, filter: 'blur(0px)', offset: 1 },
            ]
          : [
              { opacity: 1, filter: 'blur(0px)', offset: 0 },
              { opacity: 0, filter: 'blur(14px)', offset: 0.4 },
              { opacity: 0, filter: 'blur(14px)', offset: 1 },
            ],
        {
          duration: entering ? SCREEN_TRANSITION.enter : SCREEN_TRANSITION.exit * 0.85,
          delay,
          easing: entering ? 'linear' : 'ease',
        },
      );
    }
  }
  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    for (const reset of restores) reset();
  };
  const callbacks = materialRestores.get(registry) ?? new Set<() => void>();
  callbacks.add(restore);
  materialRestores.set(registry, callbacks);
  return Promise.all(promises).then(() => {
    restore();
    callbacks.delete(restore);
  });
}
