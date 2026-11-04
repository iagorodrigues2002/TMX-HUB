import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SCREEN_TRANSITION, animateScreenPanels } from '../src/lib/screen-transition';

test('tool copy exits before the next screen appears and waits through the enlarged card phase', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'getComputedStyle');
  Object.defineProperty(globalThis, 'getComputedStyle', {
    configurable: true,
    value: () => ({ position: 'relative' }),
  });
  const calls: { element: string; frames: Keyframe[]; options: KeyframeAnimationOptions }[] = [];
  const element = (name: string, text = false) => ({
    style: {},
    dataset: {},
    children: [] as unknown[],
    matches: () => text,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 900, height: 700 }),
    animate: (frames: Keyframe[], options: KeyframeAnimationOptions) => {
      calls.push({ element: name, frames, options });
      return { finished: Promise.resolve(), cancel() {} };
    },
  });
  const stage = element('stage');
  const heading = element('heading', true);
  const content = element('content');
  const material = element('material');
  const card = { ...element('card'), children: [material, content], querySelector: () => material };
  try {
    for (const entering of [false, true]) {
      calls.length = 0;
      await animateScreenPanels(
        stage as unknown as HTMLElement,
        [heading, card] as unknown as HTMLElement[],
        entering,
        new Set(),
      );
      for (const name of ['heading', 'content']) {
        const animation = calls.find((call) => call.element === name);
        assert.ok(animation);
        if (entering && name === 'content') {
          assert.equal(animation.frames[1].opacity, 0);
          assert.equal(animation.frames[1].offset, 0.24);
          assert.equal(animation.frames.at(-1)?.opacity, 1);
        } else if (!entering) {
          assert.equal(animation.frames[1].opacity, 0);
          assert.ok(Number(animation.options.duration) * 0.4 < SCREEN_TRANSITION.overlap);
        }
      }
      assert.ok(
        !calls.some(
          (call) => call.element === 'heading' && call.frames[0].transform === 'scale(1.5)',
        ),
      );
    }
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'getComputedStyle', descriptor);
    else Reflect.deleteProperty(globalThis, 'getComputedStyle');
  }
});
