import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InterfaceEffectsProvider, useInterfaceEffects } from '../src/lib/interface-effects';

function renderEffects() {
  let value!: ReturnType<typeof useInterfaceEffects>;
  function Probe() {
    value = useInterfaceEffects();
    return null;
  }
  renderToStaticMarkup(
    <InterfaceEffectsProvider>
      <Probe />
    </InterfaceEffectsProvider>,
  );
  return value;
}

test('each new page starts with sound enabled at 30 percent', () => {
  for (let reload = 0; reload < 2; reload++) {
    const value = renderEffects();
    assert.equal(value.sound, true);
    assert.equal(value.volume, 30);
    assert.equal(value.soundPending, true);
  }
});

test('manual mute still stops playback and re-enabling initializes gain at 30 percent', async () => {
  const previousFetch = globalThis.fetch;
  const previousAudio = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
  let stops = 0;
  let contexts = 0;
  const gain = { gain: { value: 0 }, connect() {} };
  class FakeAudioContext {
    state = 'running';
    destination = {};
    constructor() {
      contexts++;
    }
    createGain() {
      return gain;
    }
    async resume() {}
    async decodeAudioData() {
      return {};
    }
  }
  Object.defineProperty(globalThis, 'AudioContext', {
    configurable: true,
    value: FakeAudioContext,
  });
  globalThis.fetch = async () => new Response(new Uint8Array([1, 2, 3]));
  try {
    const value = renderEffects();
    value.playing.current = {
      stop() {
        stops++;
      },
      disconnect() {},
    } as AudioBufferSourceNode;
    await value.toggleSound();
    assert.equal(stops, 1);
    assert.equal(contexts, 0);
    await value.toggleSound();
    assert.equal(contexts, 1);
    assert.equal(gain.gain.value, 0.3);
    assert.ok(value.audioBuffer.current);
    await value.toggleSound();
    assert.equal(value.playing.current, null);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousAudio) Object.defineProperty(globalThis, 'AudioContext', previousAudio);
    else Reflect.deleteProperty(globalThis, 'AudioContext');
  }
});
