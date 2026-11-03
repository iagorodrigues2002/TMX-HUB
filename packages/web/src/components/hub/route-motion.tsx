'use client';

import { useInterfaceEffects } from '@/lib/interface-effects';
import {
  PANEL_ENTRANCE,
  ROUTE_TRANSITION,
  ROUTE_TRANSITION_FRAMES,
  claimMotionEntrance,
  motionScreenKey,
  panelEntranceFrames,
  visitMotionScreen,
} from '@/lib/motion-session';
import { getSessionGeneration } from '@/lib/session-data';
import { usePathname, useSearchParams } from 'next/navigation';
import { type RefObject, useLayoutEffect, useRef } from 'react';

function isVisible(element: HTMLElement) {
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
  const candidates = explicit.length
    ? explicit
    : Array.from(scope.querySelectorAll<HTMLElement>('section, .tmx-kpi-card'));
  const topLevel = visibleSiblings(candidates);
  return (topLevel.length ? topLevel : [scope]).slice(0, PANEL_ENTRANCE.maxPanels);
}

export function routeEntranceScreens(scope: HTMLElement): HTMLElement[] {
  return visibleSiblings(
    scope.matches('[data-motion-screen]')
      ? [scope]
      : Array.from(scope.querySelectorAll<HTMLElement>('[data-motion-screen]')),
  );
}

export function isActiveMotionTab(scope: Pick<HTMLElement, 'getAttribute'>): boolean {
  return scope.getAttribute('role') === 'tabpanel' && scope.getAttribute('data-state') === 'active';
}

export function RouteMotion({
  content,
  fullBleed,
}: { content: RefObject<HTMLDivElement | null>; fullBleed?: boolean }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const { visual } = useInterfaceEffects();
  const screenKey = `${getSessionGeneration()}:${motionScreenKey(pathname ?? '/', search)}`;
  const screenVisit = useRef<({ key: string } & ReturnType<typeof visitMotionScreen>) | null>(null);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.tmxMotion = visual ? 'on' : 'off';
    const updateVisibility = () => {
      root.dataset.tmxMotionPaused = document.hidden ? 'true' : 'false';
    };
    updateVisibility();
    document.addEventListener('visibilitychange', updateVisibility);
    return () => document.removeEventListener('visibilitychange', updateVisibility);
  }, [visual]);

  useLayoutEffect(() => {
    const element = content.current;
    if (!element) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (screenVisit.current?.key !== screenKey) {
      screenVisit.current = { key: screenKey, ...visitMotionScreen(screenKey) };
    }
    const visit = screenVisit.current;
    const running = new Set<Animation>();
    const scheduled = new Map<string, number>();
    let rootEntrance = false;
    const cancelAnimations = () => {
      for (const frame of scheduled.values()) cancelAnimationFrame(frame);
      scheduled.clear();
      for (const animation of running) animation.cancel();
      running.clear();
    };
    // New screens arrive in sequence. Revisits dissolve quickly without replaying that entrance.
    const revisiting = visit.navigating && !visit.firstVisit;
    if (revisiting) {
      if (visual && !reduced.matches && !document.hidden && typeof element.animate === 'function') {
        const animation = element.animate(ROUTE_TRANSITION_FRAMES, ROUTE_TRANSITION);
        running.add(animation);
        animation.addEventListener(
          'finish',
          () => {
            visit.navigating = false;
            running.delete(animation);
            animation.cancel();
          },
          { once: true },
        );
      }
    }
    const play = (scope: HTMLElement, key: string, reactivated = false) => {
      if (!isVisible(scope) || scheduled.has(key)) return;
      if (!visual || reduced.matches || document.hidden || typeof scope.animate !== 'function') {
        claimMotionEntrance(key);
        return;
      }
      // Schedule only the finite entrance. Polling never starts another sequence.
      scheduled.set(
        key,
        requestAnimationFrame(() => {
          scheduled.delete(key);
          if (!scope.isConnected || !isVisible(scope)) return;
          const firstEntrance = claimMotionEntrance(key);
          if (!firstEntrance && !reactivated) return;
          const panels = firstEntrance ? routeEntrancePanels(scope) : [scope];
          panels.forEach((panel, index) => {
            const animation = panel.animate(
              firstEntrance
                ? panelEntranceFrames(fullBleed || panel === element)
                : ROUTE_TRANSITION_FRAMES,
              {
                duration: firstEntrance ? PANEL_ENTRANCE.duration : ROUTE_TRANSITION.duration,
                delay: firstEntrance ? index * PANEL_ENTRANCE.stagger : 0,
                easing: PANEL_ENTRANCE.easing,
                fill: 'backwards',
              },
            );
            running.add(animation);
            animation.addEventListener(
              'finish',
              () => {
                running.delete(animation);
                animation.cancel();
              },
              { once: true },
            );
          });
        }),
      );
    };
    const playScreen = (scope: HTMLElement, reactivated = false) => {
      const name = scope.dataset.motionScreen;
      if (!name || !isVisible(scope)) return;
      // A lazily loaded screen replaces the fallback entrance, never layers over it.
      if (rootEntrance) {
        cancelAnimations();
        rootEntrance = false;
      }
      play(scope, `${screenKey}:${name}`, reactivated);
    };
    const screens = routeEntranceScreens(element);
    if (!revisiting && screens.length) {
      for (const screen of screens) playScreen(screen);
    } else if (!revisiting) {
      rootEntrance = true;
      play(element, screenKey);
    }

    // Watch explicit screen identity only, not text/values or the whole application.
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'attributes' && record.target instanceof HTMLElement) {
          playScreen(record.target, isActiveMotionTab(record.target));
        }
        for (const node of record.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          for (const screen of routeEntranceScreens(node)) {
            playScreen(screen, isActiveMotionTab(screen));
          }
        }
      }
    });
    observer.observe(element, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-motion-screen', 'data-state', 'hidden'],
    });
    const stopWhenUnavailable = () => {
      if (reduced.matches || document.hidden) cancelAnimations();
    };
    reduced.addEventListener('change', stopWhenUnavailable);
    document.addEventListener('visibilitychange', stopWhenUnavailable);
    return () => {
      cancelAnimations();
      observer.disconnect();
      reduced.removeEventListener('change', stopWhenUnavailable);
      document.removeEventListener('visibilitychange', stopWhenUnavailable);
    };
  }, [content, fullBleed, screenKey, visual]);
  return null;
}
