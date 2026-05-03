'use client';

/**
 * Floating microcopy footer (bottom-right of the viewport).
 * Mirrors the maskai/operator vibe: terminal status, version, encryption tag.
 */
export function MicroFooter() {
  return (
    <footer
      aria-label="Status"
      className="pointer-events-none fixed bottom-3 right-4 z-20 flex items-center gap-3 text-[10px] font-normal uppercase tracking-[0.18em] text-white/30"
    >
      <span aria-hidden className="status-dot" />
      <span>STATUS: ONLINE</span>
      <span aria-hidden className="text-white/20">·</span>
      <span>NEURAL-LOCK ENCRYPTION ACTIVE</span>
      <span aria-hidden className="text-white/20">·</span>
      <span>TMX.HUB v0.1</span>
    </footer>
  );
}
