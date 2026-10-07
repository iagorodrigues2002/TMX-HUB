'use client';

import { InvitesSection } from '@/components/settings/invites-section';
import { UsersSection } from '@/components/settings/users-section';
import { Button } from '@/components/ui/button';
import { DateRangeFilter } from '@/components/ui/date-range-filter';
import { Kpi } from '@/components/ui/kpi';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { PERIOD_DATE_PRESETS, isDateInRange, rollingDateRange, todayIso } from '@/lib/date-range';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  Cable,
  Clock3,
  Loader2,
  ScrollText,
  ShieldCheck,
  UserCog,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

type AdminActivity = Awaited<
  ReturnType<typeof apiClient.getAdminOverview>
>['recentActivity'][number];
type AdminView = 'overview' | 'people' | 'invites' | 'activity';

const ADMIN_VIEWS = new Set<AdminView>(['overview', 'people', 'invites', 'activity']);

function relativeDate(value?: string) {
  if (!value) return 'Sem atividade';
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 1000));
  if (seconds < 60) return 'Agora';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min atrás`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h atrás`;
  return new Date(value).toLocaleDateString('pt-BR');
}

function ActivityFeed({ entries, emptyText }: { entries: AdminActivity[]; emptyText: string }) {
  if (entries.length === 0) {
    return <p className="p-8 text-center text-sm text-white/40">{emptyText}</p>;
  }

  return entries.map((entry) => (
    <div
      key={`${entry.userId}-${entry.kind}-${entry.id}`}
      className="flex items-start gap-3 px-4 py-3"
    >
      <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300/60" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-white/75">{entry.label}</p>
        <p className="text-xs text-white/40">
          {entry.userName} · {entry.kind} · {entry.status}
        </p>
      </div>
      <span className="shrink-0 text-[11px] text-white/35">{relativeDate(entry.createdAt)}</span>
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
        <Loader2 className="h-6 w-6 animate-spin text-cyan-300" />
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
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Pessoas, acessos e operação
          </h1>
          <p className="max-w-2xl text-sm text-white/50">
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
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/[0.06] px-3 py-1.5 text-xs text-emerald-200">
            <span className="status-dot" /> Atualização automática
          </span>
        </div>
      </header>

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

      <Tabs
        value={activeView}
        onValueChange={(value) => {
          const next = value as AdminView;
          router.replace(next === 'overview' ? '/admin' : `/admin?view=${next}`, {
            scroll: false,
          });
        }}
      >
        <TabsList className="mb-5 flex h-auto justify-start overflow-x-auto">
          <TabsTrigger value="overview">Visão geral</TabsTrigger>
          <TabsTrigger value="people">Pessoas e acessos</TabsTrigger>
          <TabsTrigger value="invites">Convites</TabsTrigger>
          <TabsTrigger value="activity" className="gap-2">
            <ScrollText className="h-4 w-4" /> Atividade
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="grid gap-5 xl:grid-cols-[1fr_1.2fr]">
          <section className="glass-card overflow-hidden">
            <div className="border-b border-white/[0.06] p-4">
              <p className="hud-label">Usuários ativos</p>
            </div>
            <div className="divide-y divide-white/[0.05]">
              {(data?.users ?? []).map((entry) => (
                <div key={entry.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-white/[0.05] text-xs font-semibold text-white/70">
                    {entry.name.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white/85">{entry.name}</p>
                    <p className="truncate text-xs text-white/40">{entry.email}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-white/60">{relativeDate(entry.lastActivityAt)}</p>
                    <p className="text-[10px] uppercase tracking-wider text-white/30">
                      {entry.activityCount} ações recentes
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section className="glass-card overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] p-4">
              <div>
                <p className="hud-label">Atividade da equipe</p>
                <p className="mt-1 text-xs text-white/40">As 5 ações mais recentes</p>
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
            <div className="divide-y divide-white/[0.05]">
              <ActivityFeed
                entries={(data?.recentActivity ?? []).slice(0, 5)}
                emptyText="Nenhuma atividade registrada."
              />
            </div>
          </section>
        </TabsContent>
        <TabsContent value="people">
          <UsersSection />
        </TabsContent>
        <TabsContent value="invites">
          <InvitesSection />
        </TabsContent>
        <TabsContent value="activity">
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] p-4">
              <div>
                <p className="hud-label">Atividade administrativa</p>
                <p className="mt-1 text-sm text-white/45">
                  Ações recentes de todos os usuários do TMX.
                </p>
              </div>
              <span className="text-xs text-white/35">
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
                  <p className="mt-1 text-xs text-cyan-200/75">
                    {filteredActivity.length} registro(s)
                  </p>
                </>
              }
            />
            <div className="glass-card max-h-[680px] divide-y divide-white/[0.05] overflow-y-auto">
              <ActivityFeed
                entries={filteredActivity}
                emptyText="Nenhuma atividade registrada neste período."
              />
            </div>
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
