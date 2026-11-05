import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InterfaceEffectsProvider, useInterfaceEffects } from '../src/lib/interface-effects';

test('functional motion stays enabled while continuous background drift is opt-in', () => {
  function Reader() {
    const effects = useInterfaceEffects();
    assert.equal(typeof effects.setAmbient, 'function');
    return <span>{`visual:${effects.visual};ambient:${effects.ambient}`}</span>;
  }
  assert.equal(
    renderToStaticMarkup(
      <InterfaceEffectsProvider>
        <Reader />
      </InterfaceEffectsProvider>,
    ),
    '<span>visual:true;ambient:false</span>',
  );
});
