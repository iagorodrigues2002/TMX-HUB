'use client';

/**
 * Ambient backdrop for the /tracking surface: eight horizontal contour lines
 * drifting in de-synced phases and one slow horizontal "signal sweep". Pure
 * CSS transforms on SVG, no requestAnimationFrame, no repaint of layout.
 * The whole thing is decorative: pointer-events off, aria-hidden, disabled
 * entirely under prefers-reduced-motion by the .signal-reveal / motion rules.
 */
export function TrackingBackdrop() {
  const contours = Array.from({ length: 8 }, (_, i) => {
    const y = 90 + i * 68;
    const amp = 14 + (i % 3) * 5;
    const seed = (i * 37) % 100;
    const d = buildContour(y, amp, seed);
    const delay = -(i * 3.7);
    const duration = 42 + (i % 4) * 6;
    return { i, d, delay, duration };
  });

  return (
    <div aria-hidden className="tracking-backdrop" data-tracking-backdrop>
      <svg
        preserveAspectRatio="none"
        viewBox="0 0 1600 800"
        xmlns="http://www.w3.org/2000/svg"
        role="presentation"
        focusable="false"
      >
        <defs>
          <linearGradient id="tmx-contour" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="var(--signal-500)" stopOpacity="0" />
            <stop offset="15%" stopColor="var(--signal-500)" stopOpacity="0.55" />
            <stop offset="50%" stopColor="var(--signal-300)" stopOpacity="0.9" />
            <stop offset="85%" stopColor="var(--signal-500)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="var(--signal-500)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="tmx-sweep" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="var(--signal-500)" stopOpacity="0" />
            <stop offset="45%" stopColor="var(--signal-500)" stopOpacity="0.06" />
            <stop offset="55%" stopColor="var(--signal-500)" stopOpacity="0.10" />
            <stop offset="100%" stopColor="var(--signal-500)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect
          className="tracking-backdrop-sweep"
          x="-800"
          y="0"
          width="1600"
          height="800"
          fill="url(#tmx-sweep)"
        />
        {contours.map(({ i, d, delay, duration }) => (
          <path
            key={i}
            className="tracking-backdrop-line"
            d={d}
            fill="none"
            stroke="url(#tmx-contour)"
            strokeWidth="1"
            style={{
              animationDelay: `${delay}s`,
              animationDuration: `${duration}s`,
            }}
          />
        ))}
      </svg>
    </div>
  );
}

// Deterministic gentle sinusoid across the width — same shape on server and
// client so hydration matches. `seed` shifts phase per line.
function buildContour(y: number, amp: number, seed: number): string {
  const steps = 16;
  const w = 1600;
  const points: string[] = [];
  for (let s = 0; s <= steps; s += 1) {
    const x = (s / steps) * w;
    const phase = (s / steps) * Math.PI * 2 + (seed / 100) * Math.PI * 2;
    const dy = Math.sin(phase) * amp + Math.sin(phase * 2) * (amp * 0.35);
    points.push(`${s === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${(y + dy).toFixed(1)}`);
  }
  return points.join(' ');
}
