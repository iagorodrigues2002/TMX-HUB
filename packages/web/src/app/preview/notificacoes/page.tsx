'use client';

import { NotificationCenterPreview } from '@/components/hub/notification-center-preview';
import { Button } from '@/components/ui/button';
import { Bell, Search } from 'lucide-react';
import { useState } from 'react';

export default function NotificationsPreviewPage() {
  const [open, setOpen] = useState(true);
  const [unreadCount, setUnreadCount] = useState(4);

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <header className="flex h-16 items-center justify-between border-b border-border/70 px-5 sm:px-8">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 12h4l3-9 4 18 3-9h4" />
            </svg>
          </span>
          <span className="text-sm font-bold tracking-tight">TMX HUB</span>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" className="hidden font-normal sm:flex">
            <Search aria-hidden /> Buscar ou executar…
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setOpen(true)}
            aria-label={`Abrir ${unreadCount} notificações`}
            className="relative"
          >
            <Bell aria-hidden />
            {unreadCount > 0 && (
              <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-danger" aria-hidden />
            )}
          </Button>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-5 py-16 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Preview</p>
        <h1 className="mt-3 max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">
          Tarefas e vendas dentro do TMX
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
          Demonstração com dados fictícios. Leitura e limpeza ficam apenas na memória desta
          página; a integração por usuário ainda será implementada.
        </p>
      </section>

      <NotificationCenterPreview
        open={open}
        onOpenChange={setOpen}
        onUnreadCountChange={setUnreadCount}
      />
    </main>
  );
}
