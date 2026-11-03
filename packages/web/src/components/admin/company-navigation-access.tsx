'use client';

import { NAV_ITEMS, type NavItem } from '@/components/hub/nav-config';
import { NAVIGATION_IDS, hasNavigationAccess } from '@page-cloner/shared';

export const permissionGroups = NAV_ITEMS.filter((group) => group.id !== 'admin').map((group) => ({
  ...group,
  entries: (group.children ?? [group]).filter(
    (item) => !item.hidden && (NAVIGATION_IDS as readonly string[]).includes(item.id),
  ),
}));

export function selectedNavigation(tools: string[]) {
  return permissionGroups
    .flatMap((group) => group.entries)
    .filter((item) => {
      if (tools.includes('nav:scoped')) return hasNavigationAccess(tools, item.id);
      if (item.roles?.includes('admin') && !item.roles.includes('user')) return false;
      return item.requiresTool ? tools.includes(item.requiresTool) : tools.length > 0;
    })
    .map((item) => item.id);
}

export function navigationTools(ids: string[], previous: string[]) {
  const entries = permissionGroups.flatMap((group) => group.entries);
  const base = new Set<string>();
  for (const item of entries.filter((entry) => ids.includes(entry.id))) {
    if (item.requiresTool) base.add(item.requiresTool);
    if (item.id === 'overview') base.add('ofertas');
  }
  // Offer AI is an independent legacy entitlement, never granted by a section toggle.
  if (base.has('ofertas') && previous.includes('ofertas-ia')) base.add('ofertas-ia');
  return ['nav:scoped', ...ids.map((id) => `nav:${id}`), ...base];
}

const globalOnly = (item: NavItem) => item.roles?.includes('admin') && !item.roles.includes('user');

export function CompanyNavigationAccess({
  tools,
  onChange,
  disabled,
}: {
  tools: string[];
  onChange: (tools: string[]) => void;
  disabled?: boolean;
}) {
  const selected = selectedNavigation(tools);
  const toggle = (ids: string[], enabled: boolean) =>
    onChange(
      navigationTools(
        enabled ? [...new Set([...selected, ...ids])] : selected.filter((id) => !ids.includes(id)),
        tools,
      ),
    );
  return (
    <fieldset disabled={disabled} className="space-y-3">
      <legend className="mb-2 font-medium">Abas e ferramentas disponíveis</legend>
      <p className="text-sm text-muted-foreground">
        A mesma organização do menu lateral. Marque a seção inteira ou apenas as subabas
        necessárias. As ofertas autorizadas continuam sendo definidas abaixo.
      </p>
      <div className="grid items-start gap-3 lg:grid-cols-2">
        {permissionGroups.map((group) => {
          const available = group.entries.filter((entry) => !globalOnly(entry));
          const count = available.filter((entry) => selected.includes(entry.id)).length;
          const Icon = group.icon;
          return (
            <fieldset
              key={group.id}
              className="min-w-0 rounded-xl border border-border bg-background/60 p-4"
            >
              <legend className="sr-only">{group.label}</legend>
              <label className="flex cursor-pointer items-center gap-3 font-medium">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={available.length > 0 && count === available.length}
                  ref={(node) => {
                    if (node) node.indeterminate = count > 0 && count < available.length;
                  }}
                  onChange={(event) =>
                    toggle(
                      available.map((entry) => entry.id),
                      event.target.checked,
                    )
                  }
                />
                <Icon aria-hidden="true" className="h-4 w-4 text-primary" />
                <span className="flex-1">{group.label}</span>
                <span className="text-xs text-muted-foreground">
                  {count}/{available.length}
                </span>
              </label>
              {group.children && (
                <div className="ml-2 mt-3 space-y-1 border-l border-border pl-4">
                  {group.entries.map((item) => (
                    <label
                      key={item.id}
                      className={`flex min-h-10 items-center gap-3 rounded-md px-2 text-sm ${globalOnly(item) ? 'text-muted-foreground' : 'cursor-pointer hover:bg-muted/50'}`}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-primary"
                        disabled={!!globalOnly(item)}
                        checked={!globalOnly(item) && selected.includes(item.id)}
                        onChange={(event) => toggle([item.id], event.target.checked)}
                      />
                      <span>
                        {item.label}
                        {globalOnly(item) && (
                          <small className="block">Reservado ao administrador global</small>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Nenhuma aba selecionada = nenhum acesso delegado. Administradores da empresa mantêm as
        permissões de gestão do seu papel; esta seleção limita colaboradores.
      </p>
    </fieldset>
  );
}
