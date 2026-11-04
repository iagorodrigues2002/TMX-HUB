import assert from 'node:assert/strict';
import test from 'node:test';
import {
  animateReferenceScreen,
  cancelReferenceTransition,
} from '../../packages/web/src/components/design-system/reference-transition.ts';
import {
  SCREEN_TRANSITION,
  animateScreenPanels,
} from '../../packages/web/src/lib/screen-transition.ts';

function stageFixture() {
  const calls = [];
  let cancelled = 0;
  const element = (name) => ({
    name,
    animate(frames, options) {
      calls.push({ name, frames, options });
      return {
        finished: Promise.resolve(),
        cancel() {
          cancelled++;
        },
      };
    },
  });
  const panels = [0, 1, 2, 3, 4].map((index) => {
    const material = element(`glass-${index}`);
    const content = element(`content-${index}`);
    return {
      ...element(`panel-${index}`),
      style: {},
      children: [material, content],
      querySelector: () => material,
      getBoundingClientRect: () => ({ left: 20, top: index * 40 }),
    };
  });
  return {
    calls,
    panels,
    cancelled: () => cancelled,
    stage: {
      style: {},
      animate() {},
      parentElement: {
        getBoundingClientRect: () => ({ left: 10, top: 10, width: 600, height: 500 }),
      },
      querySelectorAll: () => panels,
    },
  };
}

globalThis.getComputedStyle = () => ({ position: 'relative' });

test('the camera aims at the viewport centre, as in Dashboard v7, rather than the panel container', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { innerWidth: 1280, innerHeight: 720 },
  });
  const fixture = stageFixture();
  const registry = new Set();
  try {
    const done = animateReferenceScreen(fixture.stage, true, registry);
    assert.equal(fixture.panels[2].style.transformOrigin, '620px 280px');
    await done;
  } finally {
    cancelReferenceTransition(registry);
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});

test('entry reproduces preview scale, stagger and separate glass/content timings in either direction', async () => {
  for (const screen of ['overview', 'offers', 'overview']) {
    const fixture = stageFixture();
    const registry = new Set();
    await animateReferenceScreen(fixture.stage, true, registry);
    assert.equal(fixture.calls.length, 15, screen);
    const panel = fixture.calls.find((call) => call.name === 'panel-2');
    assert.deepEqual(
      panel.frames.map((frame) => frame.transform),
      ['scale(1.5)', 'scale(1.4)', 'none'],
    );
    assert.equal(panel.options.delay, 70);
    assert.equal(panel.options.duration, 480);
    const glass = fixture.calls.find((call) => call.name === 'glass-2');
    assert.equal(glass.options.delay, 166);
    assert.equal(glass.options.duration, 432);
    const content = fixture.calls.find((call) => call.name === 'content-2');
    assert.equal(content.frames[0].filter, 'blur(12px)');
    assert.equal(content.frames.at(-1).filter, 'blur(0px)');
    assert.equal(fixture.panels[2].style.transformOrigin, undefined);
    cancelReferenceTransition(registry);
    assert.equal(registry.size, 0);
    assert.equal(fixture.cancelled(), 15);
  }
});

test('real routes use the same frames as the preview, including the 150ms overlap on return', async () => {
  for (const _direction of ['out', 'back']) {
    const preview = stageFixture();
    const route = stageFixture();
    await animateReferenceScreen(preview.stage, true, new Set());
    await animateScreenPanels(route.stage, route.panels, true, new Set());
    assert.deepEqual(route.calls, preview.calls);
    const delayed = stageFixture();
    await animateScreenPanels(
      delayed.stage,
      delayed.panels,
      true,
      new Set(),
      SCREEN_TRANSITION.overlap,
    );
    assert.equal(delayed.calls[0].options.delay, 150);
  }
});

test('rapid navigation cancels and restores every material before the next entrance', async () => {
  const fixture = stageFixture();
  const registry = new Set();
  const done = animateReferenceScreen(fixture.stage, true, registry);
  assert.equal(fixture.panels[2].style.transformOrigin, '290px 180px');
  cancelReferenceTransition(registry);
  assert.equal(fixture.panels[2].style.transformOrigin, undefined);
  await done;
  await animateReferenceScreen(fixture.stage, true, registry);
  cancelReferenceTransition(registry);
  assert.equal(fixture.stage.style.zIndex, undefined);
});

test('departure shrinks panels and blurs content; cancellation releases every animation', async () => {
  const fixture = stageFixture();
  const registry = new Set();
  await animateReferenceScreen(fixture.stage, false, registry);
  const panel = fixture.calls.find((call) => call.name === 'panel-4');
  assert.equal(panel.frames.at(-1).transform, 'scale(.8)');
  assert.equal(panel.options.duration, 300);
  assert.equal(panel.options.delay, 112);
  const content = fixture.calls.find((call) => call.name === 'content-4');
  assert.equal(content.frames.at(-1).filter, 'blur(14px)');
  assert.equal(content.options.duration, 255);
  cancelReferenceTransition(registry);
  cancelReferenceTransition(registry);
  assert.equal(fixture.cancelled(), 15);
});

test('Dashboard v7 titles and floating controls use their softer motion instead of card zoom', async () => {
  for (const [kind, scale] of [
    ['text', 'scale(1.18)'],
    ['chrome', 'scale(1.3)'],
  ]) {
    const fixture = stageFixture();
    fixture.panels[0].dataset = { motionKind: kind };
    const registry = new Set();
    await animateReferenceScreen(fixture.stage, true, registry);
    assert.equal(fixture.calls[0].frames[0].transform, scale);
    assert.equal(fixture.calls[0].options.easing, 'cubic-bezier(.16,1,.3,1)');
    assert.ok(!fixture.calls.some((call) => call.name === 'glass-0'));
    cancelReferenceTransition(registry);
  }
});

test('late data panels cancel in reverse order without leaving the stage styled or frozen', async () => {
  const fixture = stageFixture();
  const registry = new Set();
  const first = animateReferenceScreen(fixture.stage, true, registry);
  const late = animateReferenceScreen(fixture.stage, true, registry);
  cancelReferenceTransition(registry);
  assert.equal(fixture.stage.style.zIndex, undefined);
  assert.equal(fixture.panels[0].style.transformOrigin, undefined);
  await Promise.all([first, late]);
});
