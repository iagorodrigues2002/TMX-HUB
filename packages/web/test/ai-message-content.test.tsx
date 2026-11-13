import React from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { AiMessageContent } from '../src/components/traffic/ai-message-content';

test('formats assistant headings, emphasis, lists and tables',()=>{
 const html=renderToStaticMarkup(<AiMessageContent text={'## Resultado\n\n**ROAS** melhorou.\n\n- Primeiro\n- Segundo\n\n1. Conferir\n2. Comparar\n\n| Oferta | ROAS |\n| --- | --- |\n| PJR | 1,8 |'}/>);
 for(const tag of ['<h3','<strong','<ul','<ol','<table','<thead','<tbody'])assert.ok(html.includes(tag),tag);
 assert.ok(html.includes('1,8'));
});
test('treats model HTML and image syntax as text without executing or fetching it',()=>{
 const html=renderToStaticMarkup(<AiMessageContent text={'<script>alert(1)</script>\n\n<img src="https://example.com/private">\n\n![image](https://example.com/image)'}/>);
 assert.ok(!html.includes('<script'));assert.ok(!html.includes('<img'));assert.ok(html.includes('&lt;script&gt;'));
});
test('formats bullets immediately after an introductory paragraph',()=>{
 const html=renderToStaticMarkup(<AiMessageContent text={'Resultados:\n- **Fronts:** 10\n- Upsells: 4'}/>);
 assert.ok(html.includes('<p>Resultados:</p>'));assert.equal((html.match(/<li>/g)||[]).length,2);
});
