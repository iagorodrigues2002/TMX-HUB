'use client';

import { useInterfaceEffects } from '@/lib/interface-effects';
import {
  isActiveMotionTab,
  isVisible,
  routeAddedPanels,
  routeEntrancePanels,
  routeEntranceScreens,
} from '@/lib/route-motion-selection';
import {
  animateScreenPanels,
  cancelScreenAnimations,
  setRouteEntranceDelay,
} from '@/lib/screen-transition';
import { getSessionGeneration } from '@/lib/session-data';
import { usePathname } from 'next/navigation';
import { type ReactNode, useLayoutEffect, useRef } from 'react';
import motionStyles from './route-motion.module.css';

function routeSurface(root: HTMLElement) {
  return (
    root.querySelector<HTMLElement>('[data-motion-coordinated="true"][data-motion-screen]') ??
    root.querySelector<HTMLElement>('[data-motion-coordinated="true"]') ??
    root.querySelector<HTMLElement>('main') ??
    root.querySelector<HTMLElement>('.tmx-public-surface > div:last-child') ??
    (root.firstElementChild as HTMLElement | null)
  );
}

export function RouteMotion({ children }: { children: ReactNode }) {
  const content = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const generation = getSessionGeneration();
  const { visual } = useInterfaceEffects();

  useLayoutEffect(() => {
    const root = document.documentElement;
    const preference = visual ? 'on' : 'off';
    if (root.dataset.tmxMotion !== preference) root.dataset.tmxMotion = preference;
    let scrolling = false;
    let resumeTimer: ReturnType<typeof setTimeout> | undefined;
    const updateVisibility = () => {
      root.dataset.tmxMotionPaused = document.hidden || scrolling ? 'true' : 'false';
    };
    const pauseDuringScroll = () => {
      if (!scrolling) {
        scrolling = true;
        updateVisibility();
      }
      clearTimeout(resumeTimer);
      resumeTimer = setTimeout(() => {
        scrolling = false;
        updateVisibility();
      }, 180);
    };
    updateVisibility();
    document.addEventListener('visibilitychange', updateVisibility);
    document.addEventListener('scroll', pauseDuringScroll, { capture: true, passive: true });
    return () => {
      clearTimeout(resumeTimer);
      document.removeEventListener('scroll', pauseDuringScroll, true);
      document.removeEventListener('visibilitychange', updateVisibility);
    };
  }, [visual]);

  useLayoutEffect(() => {
    const root = content.current;
    if (!root) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const unavailable = () =>
      !visual ||
      reduced.matches ||
      document.hidden ||
      generation !== getSessionGeneration() ||
      (pathname !== null && pathname !== window.location.pathname);
    let surface = routeSurface(root);
    const running = new Set<Animation>();
    const scheduled = new Map<HTMLElement, number>();
    const played = new WeakSet<HTMLElement>();
    const animatedPanels = new WeakSet<HTMLElement>();
    const identities = new Set<string>();
    let fallback = false;
    let revision = 0;
    setRouteEntranceDelay(0);
    const cancelAnimations = () => {
      revision++;
      for (const frame of scheduled.values()) cancelAnimationFrame(frame);
      scheduled.clear();
      cancelScreenAnimations(running);
    };
    const play = (scope: HTMLElement, reactivated = false, addedPanels?: HTMLElement[]) => {
      const identity = scope.dataset.motionScreen;
      if (
        !isVisible(scope) ||
        scheduled.has(scope) ||
        (!reactivated &&
          !addedPanels &&
          (played.has(scope) || (identity && identities.has(identity))))
      )
        return;
      if (unavailable()) {
        played.add(scope);
        return;
      }
      scheduled.set(
        scope,
        requestAnimationFrame(() => {
          scheduled.delete(scope);
          if (!scope.isConnected || !isVisible(scope) || unavailable()) return;
          played.add(scope);
          if (identity) identities.add(identity);
          const panels = (addedPanels ?? routeEntrancePanels(scope)).filter(
            (panel) => reactivated || !animatedPanels.has(panel),
          );
          if (!panels.length) return;
          for (const panel of panels) animatedPanels.add(panel);
          scope.dataset.routeTransition = 'entering';
          const currentRevision = revision;
          void animateScreenPanels(scope, panels, true, running).then(() => {
            if (currentRevision !== revision || !scope.isConnected) return;
            scope.dataset.routeTransition = 'entered';
            for (const animation of running) {
              if (animation.playState === 'finished') {
                animation.cancel();
                running.delete(animation);
              }
            }
          });
        }),
      );
    };
    const playScreen = (scope: HTMLElement, reactivated = false) => {
      if (!scope.dataset.motionScreen || !isVisible(scope)) return;
      const parentScreen = scope.parentElement?.closest<HTMLElement>('[data-motion-screen]');
      if (
        parentScreen?.dataset.routeTransition === 'entering' ||
        [...scheduled.keys()].some((parent) => parent !== scope && parent.contains(scope))
      )
        return;
      if (reactivated) {
        cancelAnimations();
        setRouteEntranceDelay(0);
      }
      if (fallback) {
        cancelAnimations();
        fallback = false;
      }
      play(scope, reactivated);
    };
    const enter = () => {
      if (!surface) return;
      const screens = routeEntranceScreens(surface);
      if (screens.length) for (const screen of screens) playScreen(screen);
      else {
        fallback = true;
        play(surface);
      }
    };
    enter();
    // Only explicit identities enter again. Polling and metric text changes stay still.
    const observer = new MutationObserver((records) => {
      // Count-up text replacements do not change the route or its panel structure.
      if (
        !records.some(
          (record) =>
            record.type === 'attributes' ||
            [...record.addedNodes, ...record.removedNodes].some(
              (node) => node instanceof HTMLElement,
            ),
        )
      )
        return;
      const nextSurface = routeSurface(root);
      if (nextSurface !== surface) {
        cancelAnimations();
        surface = nextSurface;
        enter();
      }
      for (const record of records) {
        if (record.type === 'attributes' && record.target instanceof HTMLElement)
          playScreen(
            record.target,
            record.attributeName === 'data-motion-screen' || isActiveMotionTab(record.target),
          );
        for (const node of record.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          for (const screen of routeEntranceScreens(node))
            playScreen(screen, isActiveMotionTab(screen));
        }
      }
      if (surface) {
        const added = records
          .flatMap((record) => [...record.addedNodes])
          .filter((node): node is HTMLElement => node instanceof HTMLElement);
        const panels = routeAddedPanels(surface, added, animatedPanels, scheduled.keys());
        if (panels.length) play(surface, false, panels);
      }
    });
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-motion-screen', 'data-state', 'hidden'],
    });
    const stopWhenUnavailable = () => {
      if (unavailable()) {
        cancelAnimations();
      }
    };
    reduced.addEventListener('change', stopWhenUnavailable);
    document.addEventListener('visibilitychange', stopWhenUnavailable);
    return () => {
      cancelAnimations();
      observer.disconnect();
      reduced.removeEventListener('change', stopWhenUnavailable);
      document.removeEventListener('visibilitychange', stopWhenUnavailable);
    };
  }, [generation, pathname, visual]);
  return (
    <div ref={content} className={`${motionStyles.coordinated} min-h-dvh`}>
      {children}
    </div>
  );
}
