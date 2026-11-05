import assert from 'node:assert/strict';
import { test } from 'node:test';
import { animateScreenPanels, cancelScreenAnimations } from '../src/lib/screen-transition';

test('transitions animate each panel once using only opacity and transform, with bounded staggering', async () => {
  const calls: { frames: Keyframe[]; options: KeyframeAnimationOptions }[] = [];
  const panels = Array.from({ length: 40 }, () => ({
    style: {},
    getBoundingClientRect() {
      throw new Error('transitions must not measure layout');
    },
    cloneNode() {
      throw new Error('transitions must not copy content');
    },
    children: [{ animate: () => assert.fail('do not animate individual children') }],
    animate(frames: Keyframe[], options: KeyframeAnimationOptions) {
      calls.push({ frames, options });
      return { finished: Promise.resolve(), cancel() {} };
    },
  }));
  for (const entering of [true, false]) {
    calls.length = 0;
    await animateScreenPanels(
      panels[0] as unknown as HTMLElement,
      panels as unknown as HTMLElement[],
      entering,
      new Set(),
    );
    assert.equal(calls.length, panels.length);
    for (const call of calls) {
      assert.ok(Number(call.options.delay) <= 80);
      assert.ok(Number(call.options.delay) + Number(call.options.duration) <= 300);
      for (const frame of call.frames)
        assert.deepEqual(Object.keys(frame).sort(), ['opacity', 'transform']);
    }
  }
});

test('cancelling a transition releases its animations without changing panel styles', () => {
  let cancelled = 0;
  const registry = new Set([
    { cancel: () => cancelled++ } as unknown as Animation,
    { cancel: () => cancelled++ } as unknown as Animation,
  ]);
  cancelScreenAnimations(registry);
  assert.equal(cancelled, 2);
  assert.equal(registry.size, 0);
});
