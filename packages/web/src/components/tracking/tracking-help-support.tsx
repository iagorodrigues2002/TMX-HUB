'use client';

import { copyText } from '@/lib/clipboard';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clipboard,
  Code2,
  Database,
  FlaskConical,
  Radio,
  Send,
  Webhook,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';

export const steps = [
  { id: 'railway', label: 'Infraestrutura', icon: Database },
  { id: 'projeto', label: 'Oferta', icon: Radio },
  { id: 'script', label: 'Script', icon: Code2 },
  { id: 'webhook', label: 'Webhook', icon: Webhook },
  { id: 'meta', label: 'Meta CAPI', icon: Send },
  { id: 'ab-test', label: 'Teste A/B', icon: FlaskConical },
  { id: 'testes', label: 'Testes', icon: CheckCircle2 },
  { id: 'diagnostico', label: 'Diagnóstico', icon: AlertTriangle },
];

export function CopyBlock({
  children,
  label,
  copyable = true,
}: {
  children: string;
  label: string;
  copyable?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!(await copyText(children, `${label} copiado.`))) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-cyan-100/[0.12] bg-[#020b12]">
      <div className="flex items-center justify-between border-b border-cyan-100/[0.09] bg-cyan-100/[0.025] px-3 py-2">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55">
          {label}
        </span>
        {copyable ? (
          <button
            type="button"
            onClick={() => void copy()}
            className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-cyan-200/70 transition hover:text-cyan-200"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Clipboard className="h-3.5 w-3.5" />}
            {copied ? 'Copiado' : 'Copiar'}
          </button>
        ) : (
          <span className="text-[10px] uppercase tracking-[0.14em] text-amber-200/65">
            apenas exemplo
          </span>
        )}
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-xs leading-6 text-cyan-50/85">
        <code>{children}</code>
      </pre>
    </div>
  );
}

export function Section({
  id,
  number,
  title,
  subtitle,
  icon,
  children,
}: {
  id: string;
  number: string;
  title: string;
  subtitle: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="surface-panel scroll-mt-8 rounded-2xl p-5 md:p-7">
      <header className="mb-6 flex items-start gap-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-cyan-300/20 bg-cyan-300/[0.06] text-cyan-300">
          {icon}
        </div>
        <div>
          <p className="hud-label">Etapa {number}</p>
          <h2 className="mt-1 text-xl font-semibold text-white">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-white/65">{subtitle}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

export function Checklist({ items }: { items: Array<{ id: string; content: ReactNode }> }) {
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.id} className="flex gap-3 text-sm leading-6 text-white/75">
          <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-300" />
          <span>{item.content}</span>
        </li>
      ))}
    </ul>
  );
}

export function Result({
  title,
  detail,
  tone = 'ok',
}: {
  title: string;
  detail: string;
  tone?: 'ok' | 'warn';
}) {
  const warn = tone === 'warn';
  return (
    <div
      className={`rounded-md border p-4 ${
        warn
          ? 'border-amber-300/15 bg-amber-300/[0.04]'
          : 'border-emerald-300/15 bg-emerald-300/[0.04]'
      }`}
    >
      <p className={`text-sm font-medium ${warn ? 'text-amber-200' : 'text-emerald-200'}`}>
        {title}
      </p>
      <p className="mt-1 text-xs leading-5 text-white/65">{detail}</p>
    </div>
  );
}
