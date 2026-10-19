import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { UpsellPagination } from '../src/components/tracking/sections/journey/tracking-content/upsell-pagination';

test('buyer pagination shows the selected page, available sizes and bounded page navigation', () => {
  const html = renderToStaticMarkup(
    <UpsellPagination
      total={101}
      offset={20}
      pageSize={20}
      onOffsetChange={() => {}}
      onPageSizeChange={() => {}}
    />,
  );
  assert.match(html, /aria-current="page"><span[^>]*>2</);
  assert.match(html, /21–40 de 101/);
  for (const size of [10, 20, 50]) assert.match(html, new RegExp(`value="${size}"`));
  assert.match(html, />6</);
});

test('empty buyer list has no negative range or next page', () => {
  const html = renderToStaticMarkup(
    <UpsellPagination
      total={0}
      offset={0}
      pageSize={10}
      onOffsetChange={() => {}}
      onPageSizeChange={() => {}}
    />,
  );
  assert.match(html, /0–0 de 0/);
  assert.match(html, /disabled=""><span[^>]*>Próxima</);
});
