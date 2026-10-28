'use client';

import { useInterfaceEffects } from '@/lib/interface-effects';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './ambient-background.module.css';

// Fixed geometry avoids hydration randomness and per-frame React updates.
const points = Array.from({ length: 126 }, (_, i) => ({
  x: (i % 14) * 125 + 65 + Math.sin(i * 12.37) * 72,
  y: Math.floor(i / 14) * 112 + 40 + Math.cos(i * 7.91) * 65,
}));
const links = points.flatMap((a, i) =>
  points.slice(i + 1).flatMap((b, offset) => {
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    return distance < 185
      ? [{ id: `${i}-${i + offset + 1}`, a, b, opacity: 0.08 + (1 - distance / 185) * 0.35 }]
      : [];
  }),
);

export function AmbientBackground() {
  const { ambient: enabled } = useInterfaceEffects();
  const [mounted, setMounted] = useState(false);

  const [visible, setVisible] = useState(true);
  useEffect(() => {
    setMounted(true);
    const update = () => setVisible(!document.hidden);
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  return (
    <>
      {mounted &&
        createPortal(
          <div
            aria-hidden="true"
            data-tmx-ambient-viewport
            data-animated={enabled && visible}
            className={styles.background}
          >
            <svg
              viewBox="0 0 1760 1000"
              preserveAspectRatio="xMidYMid slice"
              className={styles.network}
            >
              <title>Rede decorativa TMX</title>
              {[0, 1].map((layer) => (
                <g key={layer} className={layer === 0 ? styles.near : styles.far}>
                  {links.map(({ id, a, b, opacity }) => (
                    <path key={id} d={`M${a.x},${a.y}L${b.x},${b.y}`} strokeOpacity={opacity} />
                  ))}
                  {points.map(({ x, y }, i) => (
                    <circle key={`${x}:${y}`} cx={x} cy={y} r={i % 7 === 0 ? 2.2 : 1.4} />
                  ))}
                </g>
              ))}
            </svg>
          </div>,
          document.body,
        )}
    </>
  );
}
