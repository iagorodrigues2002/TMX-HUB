import { animateScreenPanels, cancelScreenAnimations } from '../../lib/screen-transition';

export function animateReferenceScreen(
  stage: HTMLElement,
  entering: boolean,
  registry: Set<Animation>,
) {
  return animateScreenPanels(
    stage,
    Array.from(stage.querySelectorAll<HTMLElement>('[data-dolly-panel]')),
    entering,
    registry,
  );
}

export function cancelReferenceTransition(registry: Set<Animation>) {
  cancelScreenAnimations(registry);
}
