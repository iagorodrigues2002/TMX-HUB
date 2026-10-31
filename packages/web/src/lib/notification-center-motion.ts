export async function animateNotificationExit(elements: HTMLElement[], reducedMotion: boolean) {
  await Promise.allSettled(elements.map((element) => {
    if (typeof element.animate !== 'function') return Promise.resolve();
    return element.animate(
      reducedMotion
        ? [{ opacity: 1 }, { opacity: 0 }]
        : [{ opacity: 1, transform: 'translateX(0)' }, { opacity: 0, transform: 'translateX(18px)' }],
      { duration: reducedMotion ? 80 : 160, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' },
    ).finished;
  }));
}
