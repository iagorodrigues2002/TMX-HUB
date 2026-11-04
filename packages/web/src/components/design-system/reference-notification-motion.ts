/** Collapse the actual layout space after the existing fade/slide has finished. */
export async function collapseNotificationSpace(elements: HTMLElement[]) {
  await Promise.allSettled(
    elements.map((element) => {
      if (typeof element.animate !== 'function') return Promise.resolve();
      const style = element.ownerDocument.defaultView?.getComputedStyle(element);
      return element.animate(
        [
          {
            height: `${element.getBoundingClientRect().height}px`,
            minHeight: '0px',
            paddingTop: style?.paddingTop ?? '0px',
            paddingBottom: style?.paddingBottom ?? '0px',
            marginTop: style?.marginTop ?? '0px',
            marginBottom: style?.marginBottom ?? '0px',
            borderTopWidth: style?.borderTopWidth ?? '0px',
            borderBottomWidth: style?.borderBottomWidth ?? '0px',
            overflow: 'hidden',
          },
          {
            height: '0px',
            minHeight: '0px',
            paddingTop: '0px',
            paddingBottom: '0px',
            marginTop: '0px',
            marginBottom: '0px',
            borderTopWidth: '0px',
            borderBottomWidth: '0px',
            overflow: 'hidden',
          },
        ],
        { duration: 360, easing: 'cubic-bezier(0.22,1,0.36,1)', fill: 'forwards' },
      ).finished;
    }),
  );
}
