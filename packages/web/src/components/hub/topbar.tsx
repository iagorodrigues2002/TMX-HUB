'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

interface TopbarProps {
  /** Optional breadcrumb segments after the brand. e.g. ['CLONER'] or ['CLONER', 'JOB ABC123']. */
  breadcrumb?: string[];
  /** Right-side slot (status pill, build button, action buttons). */
  right?: ReactNode;
}

export function Topbar({ breadcrumb, right }: TopbarProps) {
  return (
    <header
      className="flex h-16 shrink-0 items-center gap-4 border-b border-white/[0.06] bg-[#04101A]/80 px-6 backdrop-blur-xl"
      style={{ position: 'sticky', top: 0, zIndex: 30 }}
    >
      <Link href="/" className="group flex items-center gap-3">
        <span
          aria-hidden
          className="grid h-8 w-8 place-items-center rounded-md border border-cyan-300/30 shadow-glow"
          style={{
            background:
              'linear-gradient(135deg, rgba(20,184,166,0.25), rgba(34,211,238,0.05))',
          }}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-cyan-300" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12h4l3-9 4 18 3-9h4" />
          </svg>
        </span>
        <span className="flex flex-col leading-tight">
          <span className="text-[20px] font-bold tracking-tight text-white">
            TMX{' '}
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage: 'linear-gradient(90deg, #0E7C86 0%, #22D3EE 100%)',
              }}
            >
              HUB
            </span>
          </span>
          <span className="hud-label text-[9px]">TERMINAL DE CONTROLE</span>
        </span>
      </Link>

      {breadcrumb && breadcrumb.length > 0 && (
        <nav
          aria-label="Breadcrumb"
          className="hidden items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40 md:flex"
        >
          <span aria-hidden className="text-white/25">/</span>
          {breadcrumb.map((crumb, i) => (
            <span key={`${crumb}-${i}`} className="flex items-center gap-2">
              <span className={i === breadcrumb.length - 1 ? 'text-white/70' : ''}>{crumb}</span>
              {i < breadcrumb.length - 1 && <span aria-hidden className="text-white/25">›</span>}
            </span>
          ))}
        </nav>
      )}

      <div className="ml-auto flex items-center gap-2">{right}</div>
    </header>
  );
}
