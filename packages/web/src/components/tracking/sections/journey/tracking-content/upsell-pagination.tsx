'use client';
import { Button } from '@/components/ui/button';

export function UpsellPagination({
  total,
  offset,
  pageSize,
  onOffsetChange,
  onPageSizeChange,
}: {
  total: number;
  offset: number;
  pageSize: number;
  onOffsetChange: (offset: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(pages, Math.floor(offset / pageSize) + 1);
  const visible = [...new Set([1, current - 1, current, current + 1, pages])]
    .filter((page) => page > 0 && page <= pages)
    .sort((a, b) => a - b);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] px-4 py-3 text-xs text-white/60">
      <span>
        {total ? offset + 1 : 0}–{Math.min(offset + pageSize, total)} de {total} compradores
      </span>
      <label className="flex items-center gap-2">
        Compradores por página
        <select
          className="rounded border border-white/20 bg-slate-950 px-2 py-2"
          value={pageSize}
          onChange={(event) => {
            onPageSizeChange(Number(event.target.value));
            onOffsetChange(0);
          }}
        >
          {[10, 20, 50].map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>
      <nav aria-label="Páginas de compradores" className="flex flex-wrap gap-1">
        <Button
          size="sm"
          variant="outline"
          disabled={current === 1}
          onClick={() => onOffsetChange((current - 2) * pageSize)}
        >
          Anterior
        </Button>
        {visible.map((page, index) => (
          <span className="inline-flex items-center gap-1" key={page}>
            {index > 0 && page - (visible[index - 1] ?? page) > 1 && (
              <span aria-hidden="true">…</span>
            )}
            <Button
              size="sm"
              variant={page === current ? 'default' : 'outline'}
              aria-current={page === current ? 'page' : undefined}
              onClick={() => onOffsetChange((page - 1) * pageSize)}
            >
              {page}
            </Button>
          </span>
        ))}
        <Button
          size="sm"
          variant="outline"
          disabled={current === pages}
          onClick={() => onOffsetChange(current * pageSize)}
        >
          Próxima
        </Button>
      </nav>
    </div>
  );
}
