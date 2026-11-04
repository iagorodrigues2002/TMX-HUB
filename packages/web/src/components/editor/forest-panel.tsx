'use client';

import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSelectionStore } from '@/lib/selection-store';
import { cn, truncate } from '@/lib/utils';
import type { Form, Link } from '@page-cloner/shared';
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';

interface ForestPanelProps {
  forms: Form[];
  links: Link[];
  isLoading: boolean;
}

// TODO: virtualize when lists exceed ~500 items (use @tanstack/react-virtual).
export function ForestPanel({ forms, links, isLoading }: ForestPanelProps) {
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'forms' | 'links'>('forms');
  const selected = useSelectionStore((s) => s.selected);
  const select = useSelectionStore((s) => s.select);

  const q = search.trim().toLowerCase();

  const filteredForms = useMemo(() => {
    if (!q) return forms;
    return forms.filter(
      (f) =>
        f.originalAction.toLowerCase().includes(q) ||
        f.currentAction.toLowerCase().includes(q) ||
        f.selector.toLowerCase().includes(q),
    );
  }, [forms, q]);

  const filteredLinks = useMemo(() => {
    if (!q) return links;
    return links.filter(
      (l) =>
        l.text.toLowerCase().includes(q) ||
        l.originalHref.toLowerCase().includes(q) ||
        l.currentHref.toLowerCase().includes(q),
    );
  }, [links, q]);

  return (
    <div className="flex h-full flex-col bg-background/40">
      <div className="border-b border-border p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="BUSCAR FORMS OU LINKS"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-9 text-[13px]"
          />
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as 'forms' | 'links')}
        className="flex flex-1 flex-col overflow-hidden"
      >
        <div className="px-3 pt-3">
          <TabsList>
            <TabsTrigger value="forms">Forms · {forms.length}</TabsTrigger>
            <TabsTrigger value="links">Links · {links.length}</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="forms" className="mt-2 flex-1 overflow-y-auto px-2 pb-2">
          {isLoading ? (
            <p className="px-3 py-6 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Carregando…
            </p>
          ) : filteredForms.length === 0 ? (
            <p className="px-3 py-6 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              {q ? 'Nenhum resultado.' : 'Nenhum formulário detectado.'}
            </p>
          ) : (
            <ul className="space-y-1">
              {filteredForms.map((f) => {
                const isSelected = selected?.kind === 'form' && selected.id === f.id;
                const edited =
                  f.currentAction !== f.originalAction ||
                  f.mode !== 'keep' ||
                  Boolean(f.redirectTo);
                return (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => select({ kind: 'form', id: f.id })}
                      className={cn(
                        'flex w-full items-start gap-2 rounded-md border border-transparent px-2.5 py-2 text-left text-xs transition-all',
                        'hover:border-border hover:bg-muted',
                        isSelected &&
                          'border-border bg-accent shadow-[inset_0_0_0_1px_rgba(34,211,238,0.1)]',
                      )}
                    >
                      <span
                        className={cn(
                          'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                          edited
                            ? 'bg-warning/10 shadow-[0_0_6px_rgba(251,191,36,0.6)]'
                            : 'bg-accent',
                        )}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-foreground">
                          <span className="font-mono text-[10px] uppercase tracking-wider text-primary">
                            {f.method}
                          </span>{' '}
                          {truncate(f.currentAction || f.originalAction, 32)}
                        </span>
                        <span className="block truncate pt-0.5 text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                          {f.mode} · {f.fields.length} campos
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="links" className="mt-2 flex-1 overflow-y-auto px-2 pb-2">
          {isLoading ? (
            <p className="px-3 py-6 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Carregando…
            </p>
          ) : filteredLinks.length === 0 ? (
            <p className="px-3 py-6 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              {q ? 'Nenhum resultado.' : 'Nenhum link detectado.'}
            </p>
          ) : (
            <ul className="space-y-1">
              {filteredLinks.map((l) => {
                const isSelected = selected?.kind === 'link' && selected.id === l.id;
                const edited = l.currentHref !== l.originalHref;
                return (
                  <li key={l.id}>
                    <button
                      type="button"
                      onClick={() => select({ kind: 'link', id: l.id })}
                      className={cn(
                        'flex w-full items-start gap-2 rounded-md border border-transparent px-2.5 py-2 text-left text-xs transition-all',
                        'hover:border-border hover:bg-muted',
                        isSelected &&
                          'border-border bg-accent shadow-[inset_0_0_0_1px_rgba(34,211,238,0.1)]',
                      )}
                    >
                      <span
                        className={cn(
                          'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                          edited
                            ? 'bg-warning/10 shadow-[0_0_6px_rgba(251,191,36,0.6)]'
                            : 'bg-accent',
                        )}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-foreground">
                          {truncate(l.text || l.currentHref || l.originalHref, 36)}
                        </span>
                        <span className="block truncate pt-0.5 font-mono text-[10px] text-muted-foreground">
                          {truncate(l.currentHref || l.originalHref, 44)}
                          {l.isCta && <span className="ml-1 text-primary"> · CTA</span>}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
