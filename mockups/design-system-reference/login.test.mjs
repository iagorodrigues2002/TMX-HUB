import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = readFileSync(
  new URL('../../packages/web/src/components/design-system/reference-login.tsx', import.meta.url),
  'utf8',
);

// Exercise the real component's handlers with deterministic hooks and timers; no DOM or API.
function harness() {
  const hooks = [];
  const timers = new Map();
  const cleanups = [];
  let cursor = 0;
  let tree;
  let nextTimer = 0;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = initial;
      return [
        hooks[index],
        (value) => {
          hooks[index] = typeof value === 'function' ? value(hooks[index]) : value;
        },
      ];
    },
    useRef(initial) {
      const index = cursor++;
      hooks[index] ??= { current: initial };
      return hooks[index];
    },
    useEffect(callback) {
      const cleanup = callback();
      if (typeof cleanup === 'function') cleanups.push(cleanup);
    },
  };
  const jsx = (type, props) => ({ type, props });
  const exports = {};
  const context = vm.createContext({
    exports,
    setTimeout: (callback) => {
      timers.set(++nextTimer, callback);
      return nextTimer;
    },
    clearTimeout: (id) => timers.delete(id),
    require(name) {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name === './reference.module.css') return { default: {} };
      if (name === 'lucide-react')
        return Object.fromEntries(
          ['ArrowRight', 'Check', 'Eye', 'EyeOff', 'Loader2', 'RotateCcw'].map((key) => [key, key]),
        );
      if (name.startsWith('@/components/ui/'))
        return { Button: 'Button', FormField: 'FormField', Input: 'Input' };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  vm.runInContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
    context,
  );
  function nodes(...args) {
    const node = args.length === 0 ? tree : args[0];
    if (!node || typeof node !== 'object') return [];
    return [
      node,
      ...[node.props?.children].flat(Number.POSITIVE_INFINITY).flatMap((child) => nodes(child)),
    ];
  }
  function text(node) {
    if (typeof node === 'string') return node;
    if (!node || typeof node !== 'object') return '';
    return [node.props?.children].flat(Number.POSITIVE_INFINITY).map(text).join('');
  }
  const api = {
    render() {
      cursor = 0;
      tree = exports.LoginSpecimen({ motion: false });
      return api;
    },
    input(type) {
      return nodes().find((node) => node.type === 'Input' && node.props.type === type);
    },
    button(label) {
      return nodes().find((node) => node.type === 'Button' && text(node).includes(label));
    },
    submit() {
      nodes()
        .find((node) => node.type === 'form')
        .props.onSubmit({ preventDefault() {} });
      return api.render();
    },
    flush() {
      const pending = [...timers.values()];
      timers.clear();
      for (const callback of pending) callback();
      return api.render();
    },
    nodes,
    text: () => text(tree),
    timers,
    unmount: () => {
      for (const cleanup of cleanups) cleanup();
    },
  };
  api.render();
  api.input('email').props.ref.current = { validity: { valid: true }, focus() {} };
  api.input('password').props.ref.current = { focus() {} };
  return api;
}

test('login validates fields, shows password, and completes only a simulated session', () => {
  const demo = harness();
  assert.ok(demo.text().includes('Bom ter você de volta.'));
  for (const label of ['Visão geral', 'Rastreamento', 'Financeiro'])
    assert.ok(demo.text().includes(label));
  demo.input('email').props.onChange({ target: { value: '' } });
  demo.render().submit();
  assert.ok(demo.nodes().some((node) => node.props?.error?.includes('e-mail')));
  assert.equal(demo.timers.size, 0);
  demo.input('email').props.onChange({ target: { value: 'demo@tmx.local' } });
  demo.input('password').props.onChange({ target: { value: '' } });
  demo.render().submit();
  assert.ok(demo.nodes().some((node) => node.props?.error?.includes('senha')));
  demo.input('password').props.onChange({ target: { value: 'tmx-demo' } });
  demo.render();
  demo
    .nodes()
    .find((node) => node.props?.['aria-label'] === 'Mostrar senha de exemplo')
    .props.onClick();
  demo.render();
  assert.equal(demo.input('text').props.value, 'tmx-demo');
  demo.submit();
  assert.equal(demo.timers.size, 1);
  assert.equal(demo.button('Entrando').props.disabled, true);
  demo.submit();
  assert.equal(demo.timers.size, 1);
  demo.flush();
  assert.ok(demo.text().includes('Nenhuma sessão foi criada.'));
});

test('failure is actionable and replay/unmount cancel pending completion', () => {
  const demo = harness();
  demo.button('Resultado:').props.onClick();
  demo.render().submit().flush();
  assert.ok(
    demo
      .nodes()
      .some(
        (node) =>
          node.props?.role === 'alert' && String(node.props.children).includes('Revise os dados'),
      ),
  );
  demo.submit();
  demo.button('Repetir entrada').props.onClick();
  demo.render().flush();
  assert.ok(demo.input('email'));
  demo.submit();
  demo.unmount();
  assert.equal(demo.timers.size, 0);
});
