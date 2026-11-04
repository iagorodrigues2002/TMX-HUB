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
    <div className="glass-card overflow-hidden rounded-xl border border-border bg-background">
      <div className="flex items-center justify-between border-b border-border bg-accent px-3 py-2">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </span>
        {copyable ? (
          <button
            type="button"
            onClick={() => void copy()}
            className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-primary transition hover:text-primary"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Clipboard className="h-3.5 w-3.5" />}
            {copied ? 'Copiado' : 'Copiar'}
          </button>
        ) : (
          <span className="text-[10px] uppercase tracking-[0.14em] text-warning">
            apenas exemplo
          </span>
        )}
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-xs leading-6 text-primary">
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
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-border bg-accent text-primary">
          {icon}
        </div>
        <div>
          <p className="hud-label">Etapa {number}</p>
          <h2 className="mt-1 text-xl font-semibold text-foreground">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{subtitle}</p>
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
        <li key={item.id} className="flex gap-3 text-sm leading-6 text-foreground">
          <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-success" />
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
        warn ? 'border-warning/30 bg-warning/10' : 'border-success/30 bg-success/10'
      }`}
    >
      <p className={`text-sm font-medium ${warn ? 'text-warning' : 'text-success'}`}>{title}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
    </div>
  );
}
