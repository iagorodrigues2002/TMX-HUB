'use client';

/**
 * Normal pages keep status below content so it never covers rows or actions.
 * Full-bleed editors retain the compact floating status.
 */
export function MicroFooter({ floating = false }: { floating?: boolean }) {
  return (
    <footer
      aria-label="Status"
      className={`pointer-events-none mx-auto flex max-w-[1440px] flex-wrap items-center justify-end gap-2 text-[10px] font-normal uppercase tracking-[0.12em] text-muted-foreground sm:gap-3 ${floating ? 'absolute bottom-3 right-4 z-20' : 'relative mt-6 border-t border-border/50 pt-4'}`}
    >
      <span aria-hidden className="status-dot" />
      <span>STATUS: ONLINE</span>
      <span aria-hidden className="hidden text-white/20 sm:inline">
        ·
      </span>
      <span className="hidden sm:inline">NEURAL-LOCK ENCRYPTION ACTIVE</span>
      <span aria-hidden className="text-white/20">
        ·
      </span>
      <span>TMX HUB v0.10</span>
    </footer>
  );
}
