'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

interface ToolCardProps {
  /** Pre-rendered icon (e.g. `<Layers className="h-6 w-6" />`). */
  icon: ReactNode;
  title: string;
  description: string;
  href: string;
  disabled?: boolean;
  badge?: string;
}

export function ToolCard({ icon, title, description, href, disabled, badge }: ToolCardProps) {
  const content = (
    <>
      <div className="tool-card-icon">{icon}</div>
      <div className="flex items-center gap-2">
        <h3 className="text-[16px] font-semibold leading-tight text-white">{title}</h3>
        {badge && (
          <span className="rounded-sm border border-cyan-300/30 bg-cyan-300/5 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-cyan-200/80">
            {badge}
          </span>
        )}
      </div>
      <p className="mt-1 text-[13px] leading-snug text-white/55">{description}</p>
      {!disabled && (
        <p className="mt-4 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-300/80">
          Acessar
          <svg
            viewBox="0 0 24 24"
            className="h-3 w-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14M13 5l7 7-7 7" />
          </svg>
        </p>
      )}
    </>
  );

  if (disabled) {
    return (
      <div className="tool-card" data-disabled="true" aria-disabled="true">
        {content}
      </div>
    );
  }

  return (
    <Link href={href} className="tool-card" data-disabled="false">
      {content}
    </Link>
  );
}
