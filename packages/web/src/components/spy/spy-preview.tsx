'use client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { request } from '@/lib/api-client/request';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from '@/lib/motion-router';
import { monitorSources } from '@/lib/spy-monitor-sources';
import type { spyAccessSchema } from '@/lib/spy-server-access';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowUpRight,
  ExternalLink,
  FolderOpen,
  LayoutGrid,
  List,
  Pencil,
  Plus,
  Radar,
  Search,
  Star,
} from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { z } from 'zod';
import { SpyCardReading } from './spy-card-reading';
import { SpyDetails } from './spy-details';
import { SpyEditor } from './spy-editor';
import { LibraryMonitoring, LibrarySettings } from './spy-library-panels';
import {
  type SpyOffer,
  assignSpyRegisteredOwners,
  linkKinds,
  markets,
  niches,
  parseSpySaved,
  safeSpyUrl,
  spyPending,
  spySections,
  spyStageLabel,
  spyStageOptions,
  stages,
  syncSpyMonitoringStages,
} from './spy-model';
import { SpySelect } from './spy-select';
import s from './spy.module.css';
import { libraryStatusText, useSpyLibrary } from './use-spy-library';

export function SpyPreview() {
  const localPreview = process.env.NEXT_PUBLIC_TMX_LOCAL_PREVIEW_KIND === 'synthetic';
  const client = useQueryClient();
  const [company, setCompany] = useState('');
  const params = useSearchParams();
  const fixture =
    process.env.NEXT_PUBLIC_TMX_LOCAL_PREVIEW_KIND === 'synthetic' &&
    params.get('fixture') === 'page-history';
  const { user } = useAuth();
  const usersQuery = useQuery({
    queryKey: ['spy-registered-users', user?.id],
    queryFn: async () =>
      (await request<{ users: { id: string; name: string }[] }>('/api/spy-library?view=users'))
        .users,
    staleTime: 300000,
    enabled: localPreview && user?.role === 'admin',
  });
  const catalog = useQuery({
    queryKey: ['spy-catalog', user?.id, company],
    queryFn: () =>
      request<{
        offers: SpyOffer[];
        revision: string;
        drive: string;
        access: z.infer<typeof spyAccessSchema>;
      }>('/api/spy-library?view=catalog'),
    enabled: !localPreview && !!user,
    retry: false,
    refetchOnWindowFocus: true,
  });
  const registeredUsers = localPreview
    ? (usersQuery.data ?? [])
    : (catalog.data?.access.users ?? []);
  const key = `tmx:spy-preview:v1${fixture ? ':fixture' : ''}:${user?.id ?? 'guest'}${localPreview ? '' : `:${catalog.data?.access.owner ?? company}`}`;
  const [state, setState] = useState<{ key: string; offers: SpyOffer[] }>({ key: '', offers: [] });
  const offers = state.key === key ? state.offers : [];
  const library = useSpyLibrary(offers, state.key === key && !!user, key);
  const router = useRouter();
  const tab = spySections.some(([id]) => id === params.get('view'))
    ? params.get('view')!
    : 'offers';
  const setTab = (value: string) => {
    const query = new URLSearchParams();
    if (value !== 'offers') query.set('view', value);
    if (fixture) {
      query.set('fixture', 'page-history');
      query.set('day', params.get('day') ?? '0');
    }
    router.push(`/spy${query.size ? `?${query}` : ''}`);
  };
  const tabsRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  useLayoutEffect(() => {
    const list = tabsRef.current;
    if (!list) return;
    const measure = () => {
      const el = list.querySelector<HTMLElement>(`[data-spy-tab="${tab}"]`);
      if (el)
        setPill({
          left: el.offsetLeft,
          top: el.offsetTop,
          width: el.offsetWidth,
          height: el.offsetHeight,
        });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [tab]);
  const [layout, setLayout] = useState('grid');
  const [query, setQuery] = useState('');
  const [niche, setNiche] = useState('');
  const [market, setMarket] = useState('');
  const [scope, setScope] = useState('all');
  const [sort, setSort] = useState('recent');
  const [selected, setSelected] = useState<string[]>([]);
  const [opened, setOpened] = useState<string | null>(params.get('offer'));
  const openedOffer = params.get('offer');
  useEffect(() => {
    setOpened(openedOffer);
  }, [openedOffer]);
  const [editing, setEditing] = useState<SpyOffer | null>(null);
  const [notice, setNotice] = useState('');
  const [drive, setDrive] = useState('');
  useEffect(() => {
    if (!localPreview) return;
    setSelected([]);
    setEditing(null);
    try {
      const raw = localStorage.getItem(key);
      if (!raw) throw Error('missing_local');
      setState({ key, offers: parseSpySaved(raw) });
      setDrive(localStorage.getItem(`${key}:drive`) ?? '');
    } catch {
      let alive = true;
      void request<{ offers: SpyOffer[] }>('/api/spy-library?view=seed')
        .then((data) => {
          if (alive) setState({ key, offers: parseSpySaved(JSON.stringify(data.offers)) });
        })
        .catch(() => {
          if (alive) setNotice('Não foi possível carregar o cadastro local.');
        });
      return () => {
        alive = false;
      };
    }
  }, [key, localPreview]);
  useEffect(() => {
    if (localPreview || !catalog.data) return;
    setState({ key, offers: parseSpySaved(JSON.stringify(catalog.data.offers)) });
    setDrive(catalog.data.drive);
    setSelected([]);
  }, [catalog.data, key, localPreview]);
  function save(next: SpyOffer[]) {
    if (!localPreview) {
      if (!catalog.data) return;
      void request<{ offers: SpyOffer[]; revision: string; drive: string }>('/api/spy-library', {
        method: 'POST',
        body: { action: 'save_catalog', offers: next, baseRevision: catalog.data.revision, drive },
      })
        .then((saved) => {
          client.setQueryData(['spy-catalog', user?.id, company], { ...catalog.data, ...saved });
          setNotice('Alterações salvas na empresa.');
          void client.invalidateQueries({ queryKey: ['spy-library'] });
        })
        .catch(() => {
          setNotice(
            'Não foi possível salvar. Recarregando a versão da empresa para evitar sobrescrita.',
          );
          void catalog.refetch();
        });
      return;
    }
    setState({ key, offers: next });
    try {
      localStorage.setItem(key, JSON.stringify(next));
      setNotice('Salvo nesta prévia local.');
    } catch {
      setNotice('Alteração mantida apenas nesta sessão: armazenamento indisponível.');
    }
  }
  useEffect(() => {
    if (!localPreview || !usersQuery.data || state.key !== key) return;
    const next = assignSpyRegisteredOwners(state.offers, usersQuery.data);
    if (next.every((o, i) => o === state.offers[i])) return;
    setState({ key, offers: next });
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      setNotice('Responsável atualizado nesta sessão; armazenamento local indisponível.');
    }
  }, [usersQuery.data, state, key, localPreview]);
  function change(o: SpyOffer) {
    save(offers.map((x) => (x.id === o.id ? o : x)));
  }
  useEffect(() => {
    if (state.key !== key || !library.status.data) return;
    const next = syncSpyMonitoringStages(state.offers, library.status.data.jobs);
    if (next.every((o, i) => o === state.offers[i])) return;
    setState({ key, offers: next });
    if (!localPreview) return;
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      setNotice('Status atualizado apenas nesta sessão.');
    }
  }, [state, key, library.status.data, localPreview]);
  const filtered = offers
    .filter((o) => {
      const term = [o.name, o.niche, ...o.domains, o.owner].join(' ').toLocaleLowerCase('pt-BR');
      return (
        term.includes(query.toLocaleLowerCase('pt-BR')) &&
        (!niche || o.niche === niche || (niche === '__missing' && !o.niche)) &&
        (!market || o.market === market) &&
        (scope !== 'favorites' || o.favorite) &&
        (scope !== 'pending' || spyPending(o).length > 0) &&
        (scope !== 'selected' || selected.includes(o.id))
      );
    })
    .sort((a, b) =>
      sort === 'name' ? a.name.localeCompare(b.name) : offers.indexOf(b) - offers.indexOf(a),
    );
  const current = offers.find((o) => o.id === opened);
  const planning = Object.values(library.status.data?.jobs ?? {}).filter((j) => j.optedIn);
  const flow = filtered.filter(
    (o) => !['Em pesquisa', 'Acompanhando', 'Arquivada'].includes(o.stage),
  );
  function select(id: string) {
    setSelected((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
  }
  function newOffer() {
    setEditing({
      id: crypto.randomUUID(),
      name: '',
      niche: '',
      market: 'Sem classificação',
      discoveredAt: new Date().toLocaleDateString('pt-BR'),
      domains: [],
      links: [],
      note: '',
      stage: 'Em pesquisa',
      favorite: false,
      owner:
        registeredUsers.find((u) => u.name.trim().toLowerCase() === 'douglas riti')?.name ?? '',
      ownerId: registeredUsers.find((u) => u.name.trim().toLowerCase() === 'douglas riti')?.id,
      funnelType: 'Não informado',
      deadline: '',
      priority: 'Normal',
      monitorStartedAt: null,
      observations: [],
    });
  }
  return (
    <section className={s.root}>
      {fixture && (
        <div className={s.fixtureBanner}>
          <strong>Teste simulado · histórico de páginas</strong>
          <span>Dados fictícios, separados da operação. Nenhuma chamada paga.</span>
          <div>
            {[0, 1, 2, 3].map((day) => (
              <Button
                key={day}
                size="sm"
                variant="outline"
                aria-pressed={params.get('day') === String(day)}
                onClick={() => router.push(`/spy?fixture=page-history&day=${day}`)}
              >
                {day === 0 ? 'Inicial' : `Dia ${day}`}
              </Button>
            ))}
            <a href="/spy">Sair do teste</a>
          </div>
        </div>
      )}
      <header className={s.header}>
        <div className={s.titleGroup}>
          <span className={s.logo}>
            <Radar size={25} />
          </span>
          <div>
            <h1>Spy</h1>
            <p>Encontre, acompanhe e organize suas próximas ofertas.</p>
          </div>
        </div>
        <Button onClick={newOffer}>
          <Plus size={16} />
          Nova oferta
        </Button>
      </header>
      <div className={s.context}>
        <span>
          <i />
          {offers.length} ofertas da sua base
        </span>
        {localPreview ? (
          <span>Dados da planilha · alterações salvas neste navegador</span>
        ) : (
          catalog.data && (
            <SpySelect
              label="Empresa do Spy"
              value={catalog.data.access.companyId}
              options={catalog.data.access.companies.map((c) => ({ value: c.id, label: c.name }))}
              onChange={(id) => {
                document.cookie = `tmx_spy_company=${id}; Path=/; Secure; SameSite=Lax; Max-Age=31536000`;
                setCompany(id);
                setState({ key: '', offers: [] });
                setOpened(null);
                setEditing(null);
                void client.invalidateQueries({ queryKey: ['spy-library'] });
              }}
            />
          )
        )}
      </div>
      {!localPreview && catalog.isError && (
        <p role="alert" className={s.error}>
          Não foi possível abrir o Spy desta empresa. Confira sua permissão de acesso.
        </p>
      )}
      {!localPreview && catalog.isPending && <output>Carregando ofertas da empresa…</output>}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList ref={tabsRef} className={s.spyTabs}>
          {pill && (
            <span
              aria-hidden
              className={s.spyTabPill}
              style={{
                width: pill.width,
                height: pill.height,
                transform: `translate3d(${pill.left}px,${pill.top}px,0)`,
              }}
            />
          )}
          <TabsTrigger value="offers" data-spy-tab="offers">
            Ofertas <span className={s.count}>{offers.length}</span>
          </TabsTrigger>
          <TabsTrigger value="monitor" data-spy-tab="monitor">
            Acompanhamento <span className={s.count}>{planning.length}</span>
          </TabsTrigger>
          <TabsTrigger value="cloning" data-spy-tab="cloning">
            Clonagem{' '}
            <span className={s.count}>
              {
                offers.filter(
                  (o) => !['Em pesquisa', 'Acompanhando', 'Arquivada'].includes(o.stage),
                ).length
              }
            </span>
          </TabsTrigger>
          <TabsTrigger value="settings" data-spy-tab="settings">
            Configurações
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {notice && (
        <output className={s.notice}>
          {notice}
          <button type="button" onClick={() => setNotice('')} aria-label="Dispensar aviso">
            ×
          </button>
        </output>
      )}
      {tab !== 'settings' && (
        <div className={s.filters}>
          <div className={s.search}>
            <Search size={16} />
            <input
              aria-label="Buscar ofertas Spy"
              placeholder="Buscar oferta, domínio ou responsável"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <SpySelect
            label="Filtrar nicho"
            value={niche}
            onChange={setNiche}
            options={[
              { value: '', label: 'Todos os nichos' },
              ...niches,
              { value: '__missing', label: 'Sem nicho' },
            ]}
          />
          <SpySelect
            label="Filtrar classificação"
            value={market}
            onChange={setMarket}
            options={[{ value: '', label: 'Todas as classificações' }, ...markets]}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setNiche('');
              setMarket('');
              setQuery('');
              setScope('all');
            }}
          >
            Limpar
          </Button>
        </div>
      )}
      {tab === 'offers' && (
        <>
          <div className={s.viewbar}>
            <div className={s.scopes}>
              {[
                ['all', 'Todas'],
                ['favorites', 'Favoritas'],
                ['pending', 'Com pendências'],
              ].map(([id, label]) => (
                <button
                  type="button"
                  key={id}
                  aria-pressed={scope === id}
                  onClick={() => setScope(id!)}
                >
                  {label}
                  {id === 'pending' && (
                    <span>{offers.filter((o) => spyPending(o).length).length}</span>
                  )}
                </button>
              ))}
            </div>
            <div className={s.actions}>
              <SpySelect
                label="Ordenar ofertas"
                value={sort}
                onChange={setSort}
                options={[
                  { value: 'recent', label: 'Mais recentes' },
                  { value: 'name', label: 'Nome A–Z' },
                ]}
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Visualização em cards"
                aria-pressed={layout === 'grid'}
                onClick={() => setLayout('grid')}
              >
                <LayoutGrid size={17} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Visualização em tabela"
                aria-pressed={layout === 'table'}
                onClick={() => setLayout('table')}
              >
                <List size={18} />
              </Button>
            </div>
          </div>
          {selected.length > 0 && (
            <section className={s.selection} aria-label="Ações das ofertas selecionadas">
              <strong aria-live="polite">
                <span key={selected.length} className={s.selectionCount}>
                  {selected.length}
                </span>{' '}
                {selected.length === 1 ? 'oferta selecionada' : 'ofertas selecionadas'}
              </strong>
              <SpySelect
                id="spy-bulk-niche"
                label="Alterar nicho das ofertas selecionadas"
                value=""
                options={[
                  { value: '', label: 'Alterar nicho…' },
                  ...niches,
                  { value: '__none', label: 'Sem nicho' },
                ]}
                onChange={(value) => {
                  if (!value) return;
                  save(
                    offers.map((o) =>
                      selected.includes(o.id)
                        ? { ...o, niche: value === '__none' ? '' : value }
                        : o,
                    ),
                  );
                  setNotice(`Nicho atualizado em ${selected.length} ofertas.`);
                }}
              />
              <Button
                variant="outline"
                size="sm"
                disabled={library.action.isPending || !library.status.data}
                onClick={() =>
                  library.action.mutate(
                    { action: 'bulk_monitor', ids: selected, enabled: true },
                    {
                      onSuccess: () =>
                        setNotice(`Acompanhamento ativado para ${selected.length} ofertas.`),
                      onError: () =>
                        setNotice(
                          'Não foi possível ativar. Confira as fontes das ofertas; seleção preservada.',
                        ),
                    },
                  )
                }
              >
                Acompanhar
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={library.action.isPending || !library.status.data}
                onClick={() =>
                  library.action.mutate(
                    { action: 'bulk_monitor', ids: selected, enabled: false },
                    {
                      onSuccess: () =>
                        setNotice(`Acompanhamento pausado para ${selected.length} ofertas.`),
                      onError: () =>
                        setNotice(
                          'Não foi possível pausar. A seleção foi preservada; tente novamente.',
                        ),
                    },
                  )
                }
              >
                Parar acompanhamento
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  save(
                    offers.map((o) =>
                      selected.includes(o.id) ? { ...o, stage: 'Selecionada' } : o,
                    ),
                  );
                  setSelected([]);
                  setTab('cloning');
                }}
              >
                Enviar para clonagem <ArrowUpRight size={15} />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
                Cancelar seleção
              </Button>
            </section>
          )}
          {layout === 'grid' ? (
            <div className={s.gallery}>
              {filtered.map((o) => (
                <article className={s.card} key={o.id} data-selected={selected.includes(o.id)}>
                  <span className={s.selectionOutline} aria-hidden="true">
                    <i />
                    <i />
                    <i />
                    <i />
                  </span>
                  <button
                    type="button"
                    className={s.cardOpen}
                    aria-label={`Ver oferta ${o.name} ${o.id}`}
                    onClick={() => setOpened(o.id)}
                  />
                  <div className={s.cardTop}>
                    <label className={s.check}>
                      <input
                        type="checkbox"
                        checked={selected.includes(o.id)}
                        onChange={() => select(o.id)}
                        aria-label={`Selecionar ${o.name} ${o.id}`}
                      />
                      <span>{selected.includes(o.id) ? 'Selecionada' : 'Selecionar'}</span>
                    </label>
                    <button
                      type="button"
                      className={s.star}
                      aria-label={`${o.favorite ? 'Desfavoritar' : 'Favoritar'} ${o.name} ${o.id}`}
                      aria-pressed={o.favorite}
                      onClick={() => change({ ...o, favorite: !o.favorite })}
                    >
                      <Star size={16} fill={o.favorite ? 'currentColor' : 'none'} />
                    </button>
                  </div>
                  <div className={s.cardTitle}>
                    <span className={s.monogram}>{o.name.slice(0, 2).toUpperCase()}</span>
                    <span>
                      <h2>{o.name}</h2>
                      <small>
                        {o.domains[0]?.replace(/^https?:\/\//, '') || 'Domínio não cadastrado'}
                      </small>
                    </span>
                    <ArrowUpRight size={17} />
                  </div>
                  <div className={s.nicheRow}>
                    <span className={s.tag}>{o.niche || 'Nicho pendente'}</span>
                    <span className={s.tag}>
                      {o.funnelType === 'Não informado' ? 'Funil a classificar' : o.funnelType}
                    </span>
                  </div>
                  <div className={s.cardMeta}>
                    <span
                      className={s.tag}
                      data-tone={o.market === 'Escalado' ? 'accent' : undefined}
                    >
                      {o.market}
                    </span>
                    <small>
                      {o.domains.length} {o.domains.length === 1 ? 'domínio' : 'domínios'} ·{' '}
                      {o.discoveredAt}
                    </small>
                  </div>
                  <div className={s.cardProgress}>
                    <div>
                      <span>
                        {library.status.data?.jobs[o.id]
                          ? libraryStatusText[library.status.data.jobs[o.id]!.status]
                          : 'Sem acompanhamento'}
                      </span>
                      <small>{spyStageLabel(o.stage)}</small>
                    </div>
                    <div className={s.progressTrack}>
                      <span
                        style={{
                          width: `${((library.status.data?.jobs[o.id]?.snapshots.length ?? 0) / 8) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div className={s.shortcuts}>
                    {monitorSources(
                      o.links.filter((l) => l.kind === 'library').map((l) => l.url),
                      o.domains,
                    ).map((url, i) => (
                      <a
                        className={s.libraryShortcut}
                        key={url}
                        href={safeSpyUrl(url)!}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Library ·{' '}
                        {new URL(url).searchParams.get('q')?.replaceAll('"', '') ||
                          `Página ${i + 1}`}
                        <ExternalLink size={11} />
                      </a>
                    ))}
                    {(
                      [
                        'presell',
                        ...(o.funnelType === 'Quiz'
                          ? ['quiz' as const]
                          : o.funnelType === 'TSL'
                            ? ['tsl' as const]
                            : ['vsl' as const]),
                        'folder',
                        'checkout',
                      ] as const
                    ).map((kind) => {
                      const link = o.links.find((l) => l.kind === kind);
                      const url = link && safeSpyUrl(link.url);
                      return url ? (
                        <a
                          key={kind}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`${linkKinds[kind]} · abrir primeiro link`}
                        >
                          {kind === 'folder' ? 'Drive / Ads' : linkKinds[kind]}
                          <ExternalLink size={10} />
                        </a>
                      ) : (
                        <span key={kind}>
                          {kind === 'folder' ? 'Drive / Ads' : linkKinds[kind]}
                        </span>
                      );
                    })}
                  </div>
                  <SpyCardReading job={library.status.data?.jobs[o.id]} />
                  <footer>
                    <button
                      type="button"
                      disabled={
                        library.action.isPending ||
                        !library.status.data?.jobs[o.id] ||
                        !library.status.data?.jobs[o.id]?.sources.length
                      }
                      aria-pressed={!!library.status.data?.jobs[o.id]?.optedIn}
                      onClick={() =>
                        library.action.mutate({
                          action: library.status.data?.jobs[o.id]?.optedIn ? 'pause' : 'resume',
                          id: o.id,
                        })
                      }
                    >
                      <Radar size={13} />
                      {library.status.data?.jobs[o.id]?.optedIn
                        ? 'Deixar de acompanhar'
                        : 'Acompanhar'}
                    </button>
                    <button type="button" onClick={() => setEditing(structuredClone(o))}>
                      <Pencil size={13} />
                      Editar
                    </button>
                  </footer>
                </article>
              ))}
            </div>
          ) : (
            <div className={s.tableWrap}>
              <table>
                <caption className="sr-only">Ofertas de Spy</caption>
                <thead>
                  <tr>
                    <th>Selecionar</th>
                    <th>Oferta</th>
                    <th>Nicho</th>
                    <th>Classificação</th>
                    <th>Etapa</th>
                    <th>Última leitura válida</th>
                    <th>Domínios</th>
                    <th>Links</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.includes(o.id)}
                          onChange={() => select(o.id)}
                          aria-label={`Selecionar ${o.name} ${o.id}`}
                        />
                      </td>
                      <th>
                        <button type="button" onClick={() => setOpened(o.id)}>
                          {o.name}
                        </button>
                      </th>
                      <td>{o.niche || 'Não classificado'}</td>
                      <td>{o.market}</td>
                      <td>{spyStageLabel(o.stage)}</td>
                      <td>
                        <SpyCardReading job={library.status.data?.jobs[o.id]} compact />
                      </td>
                      <td>{o.domains.length}</td>
                      <td>{o.links.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!filtered.length && (
            <div className={s.empty}>
              <Search size={27} />
              <h2>Nenhuma oferta neste filtro</h2>
              <p>Ajuste a busca ou cadastre uma nova oferta.</p>
            </div>
          )}
          <p className={s.footnote}>
            {filtered.length} de {offers.length} ofertas · nomes iguais permanecem como registros
            separados
          </p>
        </>
      )}
      {tab === 'monitor' && (
        <LibraryMonitoring offers={filtered} library={library} onOpen={setOpened} />
      )}
      {tab === 'cloning' && (
        <>
          <div className={s.sectionHeading}>
            <div>
              <h2>Da pesquisa à execução</h2>
              <p>Etapas internas de clonagem · mover uma oferta não inicia cópias automáticas.</p>
            </div>
            <span className={s.tag}>{flow.length} ofertas neste filtro</span>
          </div>
          <div className={s.board}>
            {stages.slice(2, 6).map((stage) => (
              <section className={s.lane} key={stage}>
                <h3>
                  {stage}
                  <span>{flow.filter((o) => o.stage === stage).length}</span>
                </h3>
                {flow
                  .filter((o) => o.stage === stage)
                  .map((o) => (
                    <article key={o.id} className={s.boardCard}>
                      <span className={s.tag}>{o.niche || 'Sem nicho'}</span>
                      <button type="button" onClick={() => setOpened(o.id)}>
                        {o.name}
                        <ArrowUpRight size={14} />
                      </button>
                      <p>
                        {o.owner || 'Sem responsável'} · {o.priority}
                      </p>
                      <label htmlFor={`spy-board-stage-${o.id}`}>
                        Etapa
                        <SpySelect
                          id={`spy-board-stage-${o.id}`}
                          label={`Etapa de ${o.name}`}
                          value={o.stage}
                          onChange={(stage) => change({ ...o, stage })}
                          options={spyStageOptions}
                        />
                      </label>
                    </article>
                  ))}
                {!flow.some((o) => o.stage === stage) && (
                  <p className={s.laneEmpty}>Nenhuma oferta</p>
                )}
              </section>
            ))}
          </div>
        </>
      )}
      {tab === 'settings' && (
        <div className={s.settings}>
          <LibrarySettings library={library} />
          <section className={s.panel}>
            <FolderOpen size={23} />
            <h2>Google Drive</h2>
            <p>Vincule a pasta raiz para organizar os ativos das ofertas.</p>
            <label>
              Link da pasta raiz
              <input
                type="url"
                placeholder="https://drive.google.com/drive/folders/…"
                value={drive}
                onChange={(e) => setDrive(e.target.value)}
              />
            </label>
            <Button
              variant="outline"
              onClick={() => {
                if (
                  !safeSpyUrl(drive) ||
                  !/^https:\/\/drive\.google\.com\/drive\/folders\//.test(drive)
                ) {
                  setNotice('Informe um link de pasta válido do Google Drive.');
                  return;
                }
                try {
                  if (!localPreview) {
                    save(offers);
                    return;
                  }
                  localStorage.setItem(`${key}:drive`, drive);
                  setNotice('Referência da pasta salva localmente. Nenhuma pasta foi criada.');
                } catch {
                  setNotice('Não foi possível salvar a referência.');
                }
              }}
            >
              Salvar referência
            </Button>
            <span className={s.tag}>OAuth e criação de pastas pendentes</span>
          </section>
        </div>
      )}
      <Dialog
        open={!!current || !!editing}
        onOpenChange={(open) => {
          if (!open) {
            setOpened(null);
            setEditing(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {editing ? (editing.name ? 'Editar oferta' : 'Nova oferta') : current?.name}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? 'Links completos e múltiplos destinos por oferta.'
                : 'Links, pesquisa e próximos passos da oferta.'}
            </DialogDescription>
          </DialogHeader>
          {editing ? (
            <SpyEditor
              key={editing.id}
              offer={editing}
              owners={registeredUsers}
              ownersError={usersQuery.isError}
              onCancel={() => setEditing(null)}
              onSave={(o) => {
                save(
                  offers.some((x) => x.id === o.id)
                    ? offers.map((x) => (x.id === o.id ? o : x))
                    : [...offers, o],
                );
                setEditing(null);
                setOpened(o.id);
              }}
            />
          ) : current ? (
            <SpyDetails
              key={current.id}
              offer={current}
              library={library}
              onChange={change}
              onEdit={() => setEditing(structuredClone(current))}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
