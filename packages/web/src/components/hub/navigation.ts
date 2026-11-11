import { resolveTrackingLocation } from '@/components/tracking/tracking-nav';
import { type AuthUser, canAccessTool } from '@/lib/api-client/auth-types';
import { creativeWorkspaceEnabled } from '@/lib/creative-workspace-release';
import { NAVIGATION_IDS, hasNavigationAccess } from '@page-cloner/shared';
import { NAV_ITEMS, type NavItem, flattenNavItems } from './nav-config';

const PATH_ALIASES: Record<string, string> = {
  '/help/tracking-vendepay': '/tracking',
  '/tools/creative-studio': '/tools/video-shield',
  '/tools/cloaker-urls': '/tools',
  '/tools/page-diff': '/tools',
  '/tools/digi-approval': '/tools',
};

export function canonicalNavigationLocation(pathname: string, search = '') {
  const path =
    PATH_ALIASES[pathname] ?? (pathname.startsWith('/tools/digi-approval/') ? '/tools' : pathname);
  const params = new URLSearchParams(search);
  if (path === '/tracking') {
    const location = resolveTrackingLocation(params.get('view'), params.get('section'));
    params.set('view', location.view);
    params.set('section', location.section);
  } else if (path === '/admin') {
    const view = params.get('view');
    if (!view || !['people', 'invites', 'activity'].includes(view)) params.set('view', 'overview');
  }
  return { pathname: path, params };
}

export function visibleNavigation(
  user: AuthUser | null,
  items: NavItem[] = NAV_ITEMS,
  options: {
    includeDynamic?: boolean;
    syntheticPreview?: boolean;
    creativeWorkspace?: boolean;
    canManageTasks?: boolean;
  } = {},
): NavItem[] {
  const creativeWorkspace =
    options.creativeWorkspace ?? options.syntheticPreview ?? creativeWorkspaceEnabled;
  if (!user) return [];
  return items.flatMap((item) => {
    if (
      item.hidden ||
      (item.id === 'ads-intelligence' && creativeWorkspace) ||
      (!options.includeDynamic && item.href.includes('[id]')) ||
      (item.requiresCreativeWorkspace && !creativeWorkspace) ||
      (item.roles && !item.roles.includes(user.role)) ||
      (item.id === 'operator-activity' &&
        user.role !== 'admin' &&
        !user.allowedTools?.includes('nav:operator-activity')) ||
      (item.requiresTaskManagement && user.role !== 'admin' && options.canManageTasks !== true) ||
      (item.requiresTool && !canAccessTool(user, item.requiresTool))
    )
      return [];
    if (
      !item.children &&
      user.role !== 'admin' &&
      (NAVIGATION_IDS as readonly string[]).includes(item.id) &&
      !hasNavigationAccess(user.allowedTools, item.id)
    )
      return [];
    if (!item.children) return [item];
    const children = visibleNavigation(user, item.children, options);
    return children.length ? [{ ...item, children }] : [];
  });
}

function matchScore(href: string, pathname: string, search: string) {
  const [rawPath = '', rawSearch = ''] = href.split('?');
  const expected = canonicalNavigationLocation(rawPath, rawSearch);
  const current = canonicalNavigationLocation(pathname, search);
  const dynamic = expected.pathname.includes('[id]');
  const pathMatch = dynamic
    ? new RegExp(`^${expected.pathname.replace('[id]', '[^/]+')}$`).test(current.pathname)
    : current.pathname === expected.pathname ||
      (expected.pathname !== '/' && current.pathname.startsWith(`${expected.pathname}/`));
  if (!pathMatch) return -1;
  const query = new URLSearchParams(rawSearch);
  if (expected.pathname === '/tracking') {
    query.set('view', expected.params.get('view')!);
    if (
      query.has('section') ||
      expected.params.get('view') !== new URLSearchParams(rawSearch).get('view')
    ) {
      query.set('section', expected.params.get('section')!);
    }
  } else if (expected.pathname === '/admin') {
    query.set('view', expected.params.get('view')!);
  }
  if (![...query].every(([key, value]) => current.params.get(key) === value)) return -1;
  return expected.pathname.length + query.size * 100 + (dynamic ? 500 : 0);
}

export function resolveNavigation(pathname: string, search: string, items: NavItem[] = NAV_ITEMS) {
  let match: { item: NavItem; root: NavItem; trail: NavItem[]; score: number } | null = null;
  const visit = (item: NavItem, trail: NavItem[]) => {
    if (item.hidden) return;
    const nextTrail = [...trail, item];
    if (item.children?.length) {
      for (const child of item.children) visit(child, nextTrail);
      return;
    }
    const score = Math.max(
      ...[item.href, ...(item.activeHrefs ?? [])].map((href) => matchScore(href, pathname, search)),
    );
    if (score >= 0 && (!match || score > match.score)) {
      match = { item, root: nextTrail[0]!, trail: nextTrail, score };
    }
  };
  for (const item of items) visit(item, []);
  return match as { item: NavItem; root: NavItem; trail: NavItem[]; score: number } | null;
}

export function navigationDestinations(items: NavItem[]) {
  const seen = new Set<string>();
  return flattenNavItems(items).filter((item) => {
    if (item.children?.length || item.hidden || item.href.includes('[id]')) return false;
    const [path = '', query = ''] = item.href.split('?');
    const canonical = canonicalNavigationLocation(path, query);
    canonical.params.sort();
    const key = `${canonical.pathname}?${canonical.params}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function navigationHref(item: NavItem, pathname: string, search: string) {
  const [path, query = ''] = item.href.split('?');
  if (path !== '/tracking' && path !== '/reembolsos') return item.href;
  const next = new URLSearchParams(query);
  const current = new URLSearchParams(search);
  const offer =
    /^\/ofertas\/([^/]+)$/.exec(pathname)?.[1] ?? current.get('offer') ?? current.get('offer_id');
  if (offer) next.set('offer', offer);
  if (path === pathname) {
    for (const key of ['from', 'to', 'period', 'range']) {
      const value = current.get(key);
      if (value && !next.has(key)) next.set(key, value);
    }
  }
  return next.size ? `${path}?${next}` : path!;
}
