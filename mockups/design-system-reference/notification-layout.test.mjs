import assert from 'node:assert/strict';
import test from 'node:test';
import { collapseNotificationSpace } from '../../packages/web/src/components/design-system/reference-notification-motion.ts';

test('exit closes all layout space so following cards move continuously until removal', async () => {
  const calls = [];
  const element = {
    ownerDocument: {
      defaultView: {
        getComputedStyle: () => ({
          paddingTop: '17px',
          paddingBottom: '17px',
          marginTop: '0px',
          marginBottom: '14px',
          borderTopWidth: '1px',
          borderBottomWidth: '1px',
        }),
      },
    },
    getBoundingClientRect: () => ({ height: 250 }),
    animate(frames, options) {
      calls.push({ frames, options });
      return { finished: Promise.resolve() };
    },
  };
  await collapseNotificationSpace([element, element]);
  assert.equal(calls.length, 2);
  for (const { frames, options } of calls) {
    assert.equal(frames[0].height, '250px');
    for (const name of [
      'height',
      'minHeight',
      'paddingTop',
      'paddingBottom',
      'marginTop',
      'marginBottom',
      'borderTopWidth',
      'borderBottomWidth',
    ])
      assert.equal(frames[1][name], '0px');
    assert.equal(options.duration, 360);
    assert.equal(options.fill, 'forwards');
  }
});

test('cancelled animations and unsupported animate do not block finishing the read action', async () => {
  await collapseNotificationSpace([
    {
      ownerDocument: {},
      getBoundingClientRect: () => ({ height: 100 }),
      animate: () => ({ finished: Promise.reject(new Error('cancelled')) }),
    },
    {},
  ]);
});
