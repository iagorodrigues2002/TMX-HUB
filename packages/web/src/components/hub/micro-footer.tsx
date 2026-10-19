'use client';

/**
 * Floating microcopy footer (bottom-right of the viewport).
 * Mirrors the maskai/operator vibe: terminal status, version, encryption tag.
 */
export function MicroFooter() {
  return (
    <footer
      aria-label="Status"
      className="pointer-events-none relative mx-auto mt-6 flex max-w-[1440px] flex-wrap items-center gap-2 text-[10px] font-normal uppercase tracking-[0.12em] text-white/45 sm:fixed sm:bottom-3 sm:right-4 sm:z-20 sm:mt-0 sm:gap-3 sm:tracking-[0.18em] sm:text-white/30"
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
