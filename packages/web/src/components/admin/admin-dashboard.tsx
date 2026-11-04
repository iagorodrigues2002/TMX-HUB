'use client';

import { InvitesSection } from '@/components/settings/invites-section';
import { UsersSection } from '@/components/settings/users-section';
import { Button } from '@/components/ui/button';
import { DateRangeFilter } from '@/components/ui/date-range-filter';
import { Kpi } from '@/components/ui/kpi';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { PERIOD_DATE_PRESETS, isDateInRange, rollingDateRange, todayIso } from '@/lib/date-range';
import { useRouter } from '@/lib/motion-router';
import { useQuery } from '@tanstack/react-query';
import { Activity, Cable, Clock3, Loader2, ShieldCheck, UserCog, Users } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

type AdminActivity = Awaited<
  ReturnType<typeof apiClient.getAdminOverview>
>['recentActivity'][number];
type AdminView = 'overview' | 'people' | 'invites' | 'activity';

const ADMIN_VIEWS = new Set<AdminView>(['overview', 'people', 'invites', 'activity']);
const ADMIN_TABS: ReadonlyArray<{ view: AdminView; label: string; href: string }> = [
  { view: 'overview', label: 'Visão geral', href: '/admin' },
  { view: 'people', label: 'Pessoas', href: '/admin?view=people' },
  { view: 'invites', label: 'Convites', href: '/admin?view=invites' },
  { view: 'activity', label: 'Atividade', href: '/admin?view=activity' },
];

function relativeDate(value?: string) {
  if (!value) return 'Sem atividade';
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 1000));
  if (seconds < 60) return 'Agora';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min atrás`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h atrás`;
  return new Date(value).toLocaleDateString('pt-BR');
}

function ActivityFeed({ entries, emptyText }: { entries: AdminActivity[]; emptyText: string }) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    setRevealed(false);
    const frame = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  if (entries.length === 0) {
    return <p className="p-8 text-center text-sm text-muted-foreground">{emptyText}</p>;
  }

  return entries.slice(0, 10).map((entry, index) => (
    <div
      key={`${entry.userId}-${entry.kind}-${entry.id}`}
      className={`flex items-start gap-3 px-4 py-3 transition-[opacity,transform] duration-[160ms] ease-out motion-reduce:translate-x-0 motion-reduce:opacity-100 motion-reduce:transition-none ${revealed ? 'translate-x-0 opacity-100' : '-translate-x-2 opacity-0'}`}
      style={{ transitionDelay: `${index * 30}ms` }}
    >
      <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-foreground">{entry.label}</p>
        <p className="text-xs text-muted-foreground">
          {entry.userName} · {entry.kind} · {entry.status}
        </p>
      </div>
      <span className="shrink-0 text-[11px] text-muted-foreground">
        {relativeDate(entry.createdAt)}
      </span>
    </div>
  ));
}

export function AdminDashboard() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isAdmin = user?.role === 'admin';
  const requestedView = searchParams.get('view') as AdminView | null;
  const activeView = requestedView && ADMIN_VIEWS.has(requestedView) ? requestedView : 'overview';
  const activeTabIndex = ADMIN_TABS.findIndex((tab) => tab.view === activeView);
  const [activityPeriod, setActivityPeriod] = useState(() => rollingDateRange(30));
  const overview = useQuery({
    queryKey: ['admin-overview'],
    queryFn: () => apiClient.getAdminOverview(),
    enabled: isAdmin,
    refetchInterval: 30_000,
  });
  const data = overview.data;
  const filteredActivity = useMemo(
    () =>
      (data?.recentActivity ?? []).filter((entry) =>
        isDateInRange(entry.createdAt, activityPeriod),
      ),
    [activityPeriod, data?.recentActivity],
  );

  useEffect(() => {
    if (!loading && user && !isAdmin) router.replace('/tools');
  }, [isAdmin, loading, router, user]);

  if (loading || (isAdmin && overview.isLoading)) {
    return (
      <div className="grid min-h-[45vh] place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!isAdmin) return null;

  const stats = [
    { label: 'Usuários', value: data?.totals.users ?? 0, icon: Users },
    { label: 'Ativos em 30 dias', value: data?.totals.active30d ?? 0, icon: Activity },
    { label: 'Acesso restrito', value: data?.totals.restricted ?? 0, icon: ShieldCheck },
    { label: 'Administradores', value: data?.totals.admins ?? 0, icon: UserCog },
  ];

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <p className="hud-label">Central administrativa</p>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Pessoas, acessos e operação
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Acompanhe usuários, atividade recente, convites e permissões em um só lugar.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/utmify-geral">
              <Cable className="h-4 w-4" />
              UTMify global
            </Link>
          </Button>
          <span className="inline-flex items-center gap-2 rounded-full border border-success/30 bg-success/10 px-3 py-1.5 text-xs text-success">
            <span className="status-dot" /> Atualização automática
          </span>
        </div>
      </header>

      <nav
        aria-label="Seções administrativas"
        className="relative grid grid-cols-4 border-b border-border"
      >
        {ADMIN_TABS.map((tab) => (
          <Link
            key={tab.view}
            href={tab.href}
            aria-current={activeView === tab.view ? 'page' : undefined}
            scroll={false}
            className={`flex min-h-11 items-center justify-center px-2 text-center text-xs font-semibold transition-colors duration-[180ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${activeView === tab.view ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {tab.label}
          </Link>
        ))}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 left-0 h-0.5 w-1/4 bg-primary shadow-[0_0_8px_rgba(34,211,238,0.55)] transition-transform duration-[180ms] ease-out motion-reduce:transition-none"
          style={{ transform: `translate3d(${activeTabIndex * 100}%, 0, 0)` }}
        />
      </nav>

      <div
        data-motion-coordinated="true"
        data-motion-screen={`admin:${activeView}`}
        className="space-y-8"
      >
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map(({ label, value, icon: Icon }) => (
            <Kpi
              key={label}
              label={label}
              value={value.toLocaleString('pt-BR')}
              icon={<Icon className="h-5 w-5" />}
              variant="compact"
            />
          ))}
        </section>

        {activeView === 'overview' && (
          <div className="grid gap-5 xl:grid-cols-[1fr_1.2fr]">
            <section className="glass-card overflow-hidden">
              <div className="border-b border-border p-4">
                <p className="hud-label">Usuários ativos</p>
              </div>
              <div className="divide-y divide-border">
                {(data?.users ?? []).map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center gap-3 border-l border-transparent px-4 py-3 transition-[border-color,background-color] duration-[180ms] hover:border-border hover:bg-accent motion-reduce:transition-none"
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-accent text-xs font-semibold text-muted-foreground">
                      {entry.name.slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{entry.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{entry.email}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">
                        {relativeDate(entry.lastActivityAt)}
                      </p>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {entry.activityCount} ações recentes
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
            <section className="glass-card overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-border p-4">
                <div>
                  <p className="hud-label">Atividade da equipe</p>
                  <p className="mt-1 text-xs text-muted-foreground">As 5 ações mais recentes</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => router.replace('/admin?view=activity', { scroll: false })}
                >
                  Ver tudo
                </Button>
              </div>
              <div className="divide-y divide-border">
                <ActivityFeed
                  entries={(data?.recentActivity ?? []).slice(0, 5)}
                  emptyText="Nenhuma atividade registrada."
                />
              </div>
            </section>
          </div>
        )}
        {activeView === 'people' && <UsersSection />}
        {activeView === 'invites' && <InvitesSection />}
        {activeView === 'activity' && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
              <div>
                <p className="hud-label">Atividade administrativa</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Ações recentes de todos os usuários do TMX.
                </p>
              </div>
              <span className="text-xs text-muted-foreground">
                Atualização automática a cada 30 segundos
              </span>
            </div>
            <DateRangeFilter
              value={activityPeriod}
              onChange={setActivityPeriod}
              presets={PERIOD_DATE_PRESETS}
              max={todayIso()}
              status={
                <>
                  <p className="hud-label">No período</p>
                  <p className="mt-1 text-xs text-primary">{filteredActivity.length} registro(s)</p>
                </>
              }
            />
            <div className="glass-card max-h-[680px] divide-y divide-border overflow-y-auto">
              <ActivityFeed
                entries={filteredActivity}
                emptyText="Nenhuma atividade registrada neste período."
              />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
