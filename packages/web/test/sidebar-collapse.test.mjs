import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const ts = createRequire(import.meta.url)('typescript');

// Exercise the real handlers and state updates without a browser or business providers.
function harness(component) {
  const hooks = [];
  const effects = [];
  let cursor = 0;
  let tree;
  const document = { activeElement: null };
  class Element {
    constructor(inside) {
      this.inside = inside;
    }
    closest() {
      return this.inside ? this : null;
    }
  }
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = initial;
      return [
        hooks[index],
        (next) => {
          hooks[index] = typeof next === 'function' ? next(hooks[index]) : next;
        },
      ];
    },
    useEffect(callback) {
      effects.push(callback);
    },
    useMemo(callback) {
      return callback();
    },
  };
  const jsx = (type, props) => ({ type, props });
  const exports = {};
  const namedComponents = new Proxy({}, { get: (_target, name) => name });
  vm.runInNewContext(
    ts.transpileModule(
      readFileSync(new URL(`../src/components/hub/${component}.tsx`, import.meta.url), 'utf8'),
      { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
    ).outputText,
    {
      exports,
      process: { env: {} },
      document,
      Element,
      window: { localStorage: { getItem: () => 'false', setItem() {}, removeItem() {} } },
      require(name) {
        if (name === 'react') return react;
        if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
        if (name === 'next/navigation')
          return {
            usePathname: () => '/',
            useSearchParams: () => new URLSearchParams(),
          };
        if (name === '@/lib/auth-context')
          return { useAuth: () => ({ user: { name: 'Test User' } }) };
        if (name === '@/lib/hooks/use-task-management-access')
          return {
            useTaskManagementAccess: () => ({ canManageTasks: false }),
          };
        if (name === '@/lib/utils') return { cn: (...values) => values.filter(Boolean).join(' ') };
        if (name === './navigation')
          return {
            visibleNavigation: () => [],
            resolveNavigation: () => undefined,
          };
        if (
          name.startsWith('./') ||
          name.startsWith('@/components/') ||
          name === 'lucide-react' ||
          name === 'next/link'
        )
          return namedComponents;
        throw new Error(`Unexpected dependency ${name}`);
      },
    },
  );
  function nodes(node) {
    if (!node || typeof node !== 'object') return [];
    return [
      node,
      ...[node.props?.children].flat(Number.POSITIVE_INFINITY).flatMap((child) => nodes(child)),
    ];
  }
  return {
    document,
    Element,
    render(props = {}) {
      cursor = 0;
      tree = exports[component === 'sidebar' ? 'Sidebar' : 'HubShell'](props);
    },
    flushEffects() {
      while (effects.length) effects.shift()();
    },
    find(predicate) {
      const found = nodes(tree).find(predicate);
      assert.ok(found);
      return found;
    },
  };
}

test('legacy pinned preference cannot open the hover rail on mount; outside pointer closes a manual opening', () => {
  const h = harness('hub-shell');
  const sidebar = () => h.find((node) => node.type === 'Sidebar');
  const topbar = () => h.find((node) => node.type === 'Topbar');
  const workspace = () => h.find((node) => node.props?.className?.includes('tmx-workspace'));
  h.render();
  h.flushEffects();
  h.render();
  assert.equal(sidebar().props.collapsed, true);
  topbar().props.onToggleSidebar();
  h.render();
  assert.equal(sidebar().props.collapsed, false);
  workspace().props.onPointerDownCapture({ target: new h.Element(true) });
  h.render();
  assert.equal(sidebar().props.collapsed, false);
  workspace().props.onPointerDownCapture({ target: new h.Element(false) });
  h.render();
  assert.equal(sidebar().props.collapsed, true);
});

test('pointer leave releases both hover and manual expansion instead of pinning the scrim', () => {
  const h = harness('sidebar');
  let collapsed = false;
  const render = () =>
    h.render({
      collapsed,
      onCollapse: () => {
        collapsed = true;
      },
    });
  const rail = () => h.find((node) => node.type === 'aside');
  render();
  rail().props.onMouseEnter();
  render();
  assert.equal(rail().props['data-collapsed'], false);
  rail().props.onMouseLeave({ currentTarget: { contains: () => false } });
  render();
  assert.equal(rail().props['data-collapsed'], true);
});

test('keyboard focus stays open within the sidebar and closes when focus leaves', () => {
  const h = harness('sidebar');
  const render = () => h.render({ collapsed: true, onCollapse() {} });
  const rail = () => h.find((node) => node.type === 'aside');
  render();
  rail().props.onFocus();
  render();
  h.document.activeElement = { matches: () => true };
  rail().props.onMouseLeave({ currentTarget: { contains: () => true } });
  render();
  assert.equal(rail().props['data-collapsed'], false);
  rail().props.onBlur({ relatedTarget: {}, currentTarget: { contains: () => true } });
  render();
  assert.equal(rail().props['data-collapsed'], false);
  rail().props.onBlur({ relatedTarget: null, currentTarget: { contains: () => false } });
  render();
  assert.equal(rail().props['data-collapsed'], true);
});
