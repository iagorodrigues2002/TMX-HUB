import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

test('notification demo marks only the filtered category, supports undo and hides sale amounts', () => {
  const require = createRequire(import.meta.url);
  const ts = require('typescript');
  const source = readFileSync(
    new URL(
      '../../packages/web/src/components/design-system/reference-notifications.tsx',
      import.meta.url,
    ),
    'utf8',
  );
  const hooks = [];
  let motion = false;
  const timers = new Map();
  let cursor = 0;
  let tree;
  let timerId = 0;
  const cleanups = [];
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
      if (cleanup) cleanups.push(cleanup);
    },
  };
  const jsx = (type, props) => ({ type, props });
  const exports = {};
  const context = vm.createContext({
    exports,
    Set,
    window: { matchMedia: () => ({ matches: false }) },
    setTimeout(callback) {
      timers.set(++timerId, callback);
      return timerId;
    },
    clearTimeout: (id) => timers.delete(id),
    require(name) {
      if (name === 'react') return react;
      if (name === '@/lib/notification-center-motion')
        return { animateNotificationExit: () => Promise.resolve() };
      if (name === './reference-notification-motion')
        return { collapseNotificationSpace: () => Promise.resolve() };
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name === './reference.module.css') return { default: {} };
      if (name.startsWith('@/components/ui/') || name === 'lucide-react')
        return new Proxy({}, { get: (_, key) => key });
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  vm.runInContext(
    ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    context,
  );
  function render() {
    cursor = 0;
    tree = exports.NotificationsSpecimen({ theme: 'dark', motion });
  }
  function visit(node) {
    if (!node || typeof node !== 'object') return [];
    return [node, ...[node.props?.children].flat(Number.POSITIVE_INFINITY).flatMap(visit)];
  }
  function text(node) {
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (!node || typeof node !== 'object') return '';
    return [node.props?.children].flat(Number.POSITIVE_INFINITY).map(text).join('');
  }
  const nodes = () => visit(tree);
  const button = (label) =>
    nodes().find((node) => node.type === 'Button' && text(node).includes(label));
  render();
  assert.ok(text(tree).includes('4 não lidas'));
  nodes()
    .find((node) => node.type === 'Tabs')
    .props.onValueChange('Vendas');
  render();
  assert.equal(nodes().filter((node) => node.type === 'article').length, 6);
  button('Marcar exibidas').props.onClick();
  render();
  assert.ok(text(tree).includes('1 não lidas'), text(tree).slice(0, 700));
  assert.equal(nodes().filter((node) => node.type === 'article').length, 0);
  assert.equal(button('Marcar exibidas').props.disabled, true);
  button('Desfazer ação').props.onClick();
  render();
  assert.equal(nodes().filter((node) => node.type === 'article').length, 6);
  assert.ok(text(tree).includes('4 não lidas'));
  nodes()
    .find((node) => node.props?.['aria-label'] === 'Ocultar valores das notificações')
    .props.onClick();
  render();
  assert.ok(!text(tree).includes('MX$ 438,29'));
  assert.ok(text(tree).includes('••••••'));
  nodes()
    .find((node) => node.props?.['aria-label'] === 'Atualizar notificações de exemplo')
    .props.onClick();
  render();
  assert.equal(timers.size, 1);
  assert.equal(button('Marcar exibidas').props.disabled, true);
  const refresh = [...timers.values()];
  timers.clear();
  for (const callback of refresh) callback();
  render();
  motion = true;
  render();
  nodes()
    .find((node) => node.type === 'Tabs')
    .props.onValueChange('Tarefas');
  render();
  assert.equal(nodes().filter((node) => node.type === 'article').length, 6);
  nodes()
    .find((node) => node.type === 'Tabs')
    .props.onValueChange('Todas');
  render();
  assert.equal(timers.size, 1);
  const departure = [...timers.values()];
  timers.clear();
  for (const callback of departure) callback();
  render();
  assert.equal(nodes().filter((node) => node.type === 'article').length, 14);
  assert.equal(button('Marcar exibidas').props.disabled, true);
  motion = false;
  render();
  nodes()
    .find((node) => node.type === 'Tabs')
    .props.onValueChange('Tarefas');
  render();
  assert.equal(nodes().filter((node) => node.type === 'article').length, 6);
  button('Marcar exibidas').props.onClick();
  render();
  assert.equal(nodes().filter((node) => node.type === 'article').length, 6);
  assert.ok(
    nodes()
      .filter((node) => node.type === 'article')
      .every((node) => node.props['data-read']),
  );
  button('Concluída').props.onClick();
  render();
  assert.equal(nodes().filter((node) => node.type === 'article').length, 4);
  button('Desfazer ação').props.onClick();
  render();
  assert.equal(nodes().filter((node) => node.type === 'article').length, 6);
  nodes()
    .find((node) => node.type === 'Tabs')
    .props.onValueChange('Calls');
  render();
  assert.equal(nodes().filter((node) => node.type === 'article').length, 2);
  assert.ok(
    nodes()
      .filter((node) => node.type === 'article')
      .every((node) => node.props['data-read']),
  );
  for (const cleanup of cleanups) cleanup();
  assert.equal(timers.size, 0);
});
