'use client';
import { useAuth } from '@/lib/auth-context';
import { hasNavigationAccess } from '@page-cloner/shared';
import { Bot, Maximize2, X } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

const Chat = dynamic(() => import('./ai-assistant').then((m) => m.AiAssistant), {
  ssr: false,
  loading: () => (
    <output className="block p-5 text-sm text-muted-foreground">Carregando sua conversa…</output>
  ),
});

export function AiFloatingChat() {
  const { user } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Close when navigation or the signed-in identity changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname, user?.id]);
  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [open]);
  if (
    !user ||
    (user.role !== 'admin' && !hasNavigationAccess(user.allowedTools, 'ai-assistant')) ||
    pathname === '/assistente'
  )
    return null;
  return (
    <div className="fixed bottom-5 right-4 z-40 flex flex-col items-end gap-3 sm:right-6">
      {open && (
        <dialog
          open
          id="tmx-floating-chat"
          aria-modal="false"
          aria-labelledby="floating-chat-title"
          className="glass-card relative m-0 flex h-[min(640px,calc(100dvh-7rem))] w-[min(440px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-primary/20 bg-background p-0 text-foreground shadow-2xl"
        >
          <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
            <Bot size={18} className="text-primary" />
            <h2 id="floating-chat-title" className="flex-1 text-sm font-semibold">
              Assistente IA
            </h2>
            <Link
              href="/assistente"
              aria-label="Abrir conversa em página completa"
              title="Abrir página completa"
              className="rounded-lg p-2 text-muted-foreground hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Maximize2 size={16} />
            </Link>
            <button
              ref={closeButton}
              type="button"
              aria-label="Fechar chat"
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
              }}
              className="rounded-lg p-2 text-muted-foreground hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary"
            >
              <X size={18} />
            </button>
          </header>
          <div className="min-h-0 flex-1">
            <Chat compact />
          </div>
        </dialog>
      )}
      <button
        ref={trigger}
        type="button"
        aria-label={open ? 'Minimizar assistente' : 'Conversar com o assistente'}
        aria-expanded={open}
        aria-controls="tmx-floating-chat"
        onClick={() => setOpen((value) => !value)}
        className="flex h-12 items-center gap-2 rounded-full border border-primary/30 bg-primary px-4 text-sm font-medium text-primary-foreground shadow-lg transition-transform hover:scale-[1.03] active:scale-[.98] motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      >
        <Bot size={20} />
        <span>Assistente IA</span>
      </button>
    </div>
  );
}
