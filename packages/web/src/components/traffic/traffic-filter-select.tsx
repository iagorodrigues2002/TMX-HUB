'use client';
import { useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuLabel } from '@/components/ui/dropdown-menu';

export type TrafficFilterOption = { value: string; label: string; group?: string };
export function TrafficFilterSelect({ label, value, options, onChange }: {
  label: string; value: string; options: TrafficFilterOption[]; onChange: (value: string) => void;
}) {
  const [query, setQuery] = useState('');
  const search = useRef<HTMLInputElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const filtered = options.filter(option => `${option.label} ${option.value}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const groups = [...new Set(filtered.map(option => option.group ?? ''))];
  return <DropdownMenu onOpenChange={open => { setQuery(''); if (open) requestAnimationFrame(() => search.current?.focus()); }}>
    <DropdownMenuTrigger asChild><button type="button" aria-label={label} className="flex h-10 min-w-40 max-w-full items-center justify-between gap-3 rounded-lg border border-border bg-background/60 px-3 text-sm text-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
      <span className="truncate">{options.find(option => option.value === value)?.label ?? label}</span><ChevronDown className="size-4 shrink-0 text-muted-foreground" />
    </button></DropdownMenuTrigger>
    <DropdownMenuContent ref={menu} align="start" className="w-80 max-w-[calc(100vw-2rem)] rounded-xl p-0">
      <div className="sticky top-0 z-10 border-b border-border bg-popover p-3"><label className="flex items-center gap-2"><Search className="size-4 text-muted-foreground" /><input ref={search} autoComplete="off" aria-label={`Buscar em ${label}`} placeholder="Buscar por nome ou ID…" className="min-w-0 flex-1 bg-transparent text-sm outline-none" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); event.stopPropagation();
          const items = menu.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]');
          (event.key === 'ArrowDown' ? items?.[0] : items?.[items.length - 1])?.focus();
        } else if (!['Escape', 'Tab'].includes(event.key)) event.stopPropagation();
      }} /></label></div>
      <div className="max-h-72 overflow-y-auto overscroll-contain p-1"><DropdownMenuRadioGroup value={value} onValueChange={onChange}>
        {groups.map(group => <div key={group}>{group && <DropdownMenuLabel className="mt-2 border-t border-border px-3 pt-3 text-xs text-muted-foreground">{group}</DropdownMenuLabel>}{filtered.filter(option => (option.group ?? '') === group).map(option => <DropdownMenuRadioItem className="min-h-10 cursor-pointer rounded-lg py-2 pr-3 text-sm data-[state=checked]:bg-accent" key={option.value} value={option.value}>{option.label}</DropdownMenuRadioItem>)}</div>)}
      </DropdownMenuRadioGroup>{!filtered.length && <p className="p-4 text-sm text-muted-foreground" role="status">Nenhum resultado.</p>}</div>
    </DropdownMenuContent>
  </DropdownMenu>;
}
