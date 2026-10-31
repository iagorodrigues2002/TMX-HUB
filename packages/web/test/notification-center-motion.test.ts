import assert from 'node:assert/strict';
import { test } from 'node:test';
import { animateNotificationExit } from '../src/lib/notification-center-motion';

test('exit waits for the animation and only animates opacity/transform', async () => {
  let finish!: () => void;
  let settled = false;
  const finished = new Promise<void>((resolve) => { finish = resolve; });
  const element = { animate: (frames: Keyframe[], options: KeyframeAnimationOptions) => {
    assert.equal(options.duration, 160);
    assert.deepEqual(Object.keys(frames[1]).sort(), ['opacity', 'transform']);
    return { finished };
  } } as unknown as HTMLElement;
  const exit = animateNotificationExit([element], false).then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false);
  finish();
  await exit;
  assert.equal(settled, true);
});

test('reduced motion fades without displacement; cancelled or unsupported animations never block', async () => {
  const element = { animate: (frames: Keyframe[], options: KeyframeAnimationOptions) => {
    assert.deepEqual(frames, [{ opacity: 1 }, { opacity: 0 }]);
    assert.equal(options.duration, 80);
    return { finished: Promise.reject(new Error('cancelled')) };
  } } as unknown as HTMLElement;
  await animateNotificationExit([element, {} as HTMLElement], true);
  await animateNotificationExit([], false);
});
