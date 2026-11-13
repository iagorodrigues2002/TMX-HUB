'use client';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { request } from '@/lib/api-client/request';
import { useAuth } from '@/lib/auth-context';
import { safeAdThumbnail } from '@/lib/spy-ad-preview';
import type { CreativeStatus, CreativeSummary } from '@/lib/spy-creative-analysis';
import type { LibraryAd } from '@/lib/spy-library-reader';
import type { LibraryPageSummary } from '@/lib/spy-library-store';
import { useQuery } from '@tanstack/react-query';
import { Building2, ExternalLink, ImageIcon, Layers3 } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import s from './spy.module.css';

const creativeLabels = {
  new: 'Novo no histórico',
  duplicate: 'Criativo reutilizado',
  variation: 'Variação de texto/destino',
  unverified: 'Não confirmado',
};
const creativeReasons = {
  same_media_copy: 'Mídia completa e texto iguais aos já coletados.',
  different_copy: 'Mesma mídia completa, com texto ou destino diferente.',
  same_thumbnail:
    'Capa idêntica: possível reutilização. O vídeo completo ainda não foi confirmado.',
  same_group: 'Mesmo grupo na Library: possível reutilização, ainda sem confirmação da mídia.',
  incomplete_history: 'Histórico sem mídia completa suficiente para confirmar novidade.',
  missing_media: 'Mídia ou texto insuficientes para concluir.',
  no_match:
    'Mídia completa diferente das coletadas anteriormente. Edições e recodificações podem não ser reconhecidas.',
  baseline: 'Primeira leitura do acompanhamento.',
};

function PageAvatar({ page }: { page: LibraryPageSummary }) {
  const [failed, setFailed] = useState<string>();
  const image = page.pagePictureKey
    ? `/api/spy-library?view=image&key=${page.pagePictureKey}`
    : safeAdThumbnail(page.pagePictureUrl);
  return (
    <span className={s.pageAvatar}>
      {image && failed !== image ? (
        <img
          src={image}
          alt={`Foto de ${page.pageName}`}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(image)}
        />
      ) : (
        <Building2 size={20} aria-hidden="true" />
      )}
    </span>
  );
}

function AdVisualCard({ ad }: { ad: LibraryAd }) {
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const thumbnail =
    (ad.thumbnailKey
      ? `/api/spy-library?view=image&key=${ad.thumbnailKey}`
      : safeAdThumbnail(ad.thumbnailUrl)) ??
    (process.env.NEXT_PUBLIC_TMX_LOCAL_PREVIEW_KIND === 'synthetic' &&
    ad.thumbnailUrl === '/spy-preview/ad-sample.svg'
      ? ad.thumbnailUrl
      : undefined);
  return (
    <li className={s.adCard}>
      <a
        className={s.adThumb}
        href={ad.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Abrir ${ad.isNew ? 'anúncio novo' : ad.isReturning ? 'anúncio que reapareceu' : 'anúncio'} ${ad.id} na Library`}
      >
        {thumbnail && !failed ? (
          <img
            src={thumbnail}
            alt={`Prévia do anúncio de ${ad.pageName}`}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
          />
        ) : (
          <span>
            <ImageIcon size={30} />
            <small>{failed ? 'Miniatura indisponível' : 'Miniatura não salva nesta leitura'}</small>
          </span>
        )}
        <span className={s.adOpen}>
          Abrir na Library <ExternalLink size={13} />
        </span>
        {ad.isNew && (
          <span className={s.newBadge} aria-label="Anúncio novo neste acompanhamento">
            Novo ID
          </span>
        )}
        {ad.isReturning && <span className={s.returnBadge}>Reapareceu</span>}
      </a>
      <div className={s.adCopy}>
        {ad.relatedAds && ad.relatedAds.length > 1 && (
          <div className={s.creativeEvidence}>
            <strong>{ad.relatedAds.length} anúncios com a mesma mídia</strong>
            <p>{ad.relatedAds.filter((a) => a.isNew).length} IDs novos neste grupo</p>
            <details>
              <summary>Ver IDs, diferenças e referências</summary>
              {ad.relatedAds.map((member) => (
                <div key={member.id}>
                  <a href={member.url} target="_blank" rel="noopener noreferrer">
                    Anúncio {member.id} · {member.pageName}
                  </a>
                  <p>
                    {member.creativeAnalysis
                      ? creativeLabels[member.creativeAnalysis.status]
                      : 'Já acompanhado'}
                  </p>
                  {member.creativeAnalysis?.previous && (
                    <a
                      href={`https://www.facebook.com/ads/library/?id=${member.creativeAnalysis.previous.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Correspondência · {member.creativeAnalysis.previous.id}
                      <br />
                      Observado em{' '}
                      {new Date(member.creativeAnalysis.previous.at).toLocaleString('pt-BR', {
                        timeZone: 'America/Sao_Paulo',
                      })}
                    </a>
                  )}
                </div>
              ))}
            </details>
          </div>
        )}
        {ad.creativeAnalysis && (
          <div className={s.creativeEvidence}>
            <strong>{creativeLabels[ad.creativeAnalysis.status]}</strong>
            <p>{creativeReasons[ad.creativeAnalysis.reason]}</p>
            {ad.creativeRecoveredAt && (
              <details>
                <summary>Sobre a comparação</summary>
                <small>
                  Mídia recuperada em {new Date(ad.creativeRecoveredAt).toLocaleDateString('pt-BR')}{' '}
                  · comparação dos detalhes disponíveis agora.
                </small>
              </details>
            )}
            {ad.creativeAnalysis.previous && (
              <a
                href={`https://www.facebook.com/ads/library/?id=${encodeURIComponent(ad.creativeAnalysis.previous.id)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {ad.creativeAnalysis.previous.sameReading
                  ? 'Correspondência nesta coleta'
                  : 'Anúncio anterior'}{' '}
                · {ad.creativeAnalysis.previous.id} <ExternalLink size={12} aria-hidden="true" />
                <br />
                Observado em{' '}
                {new Date(ad.creativeAnalysis.previous.at).toLocaleString('pt-BR', {
                  timeZone: 'America/Sao_Paulo',
                })}
              </a>
            )}
          </div>
        )}
        <span className={s.activeVolume}>
          {ad.activeGroupCount?.toLocaleString('pt-BR') ?? '—'}{' '}
          {ad.activeGroupCount === 1 ? 'anúncio ativo encontrado' : 'anúncios ativos encontrados'}
          {ad.collationId ? ' no grupo' : ''}
        </span>
        <span className={s.volumeBadge}>
          {ad.collationCount
            ? `${ad.collationCount.toLocaleString('pt-BR')} ${ad.collationCount === 1 ? 'anúncio' : 'anúncios'} no grupo`
            : 'Volume não informado'}
        </span>
        <small>{ad.pageName || 'Página sem nome'}</small>
        <h5>{ad.title || `Anúncio ${ad.id}`}</h5>
        <p className={expanded ? '' : s.adDescription}>
          {ad.description || 'Descrição não disponível nesta leitura.'}
        </p>
        {ad.description && (
          <button type="button" onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'Recolher texto' : 'Ver mais'}
          </button>
        )}
      </div>
    </li>
  );
}

export function SpyAdsList({
  id,
  at,
  kind = 'ads',
  all = false,
}: { id: string; at: string; kind?: 'ads' | 'pages'; all?: boolean }) {
  const isPages = kind === 'pages';
  const params = useSearchParams();
  const fixture =
    process.env.NEXT_PUBLIC_TMX_LOCAL_PREVIEW_KIND === 'synthetic' &&
    params.get('fixture') === 'page-history';
  const fixtureDay = fixture ? (params.get('day') ?? '0') : '';
  const { user } = useAuth();
  const [page, setPage] = useState({ id, at, offset: 0 });
  const [creative, setCreative] = useState<CreativeStatus | 'all-new' | ''>(() =>
    ['all-new', 'new', 'duplicate', 'variation', 'unverified'].includes(
      params.get('creative') ?? '',
    )
      ? (params.get('creative') as CreativeStatus | 'all-new')
      : '',
  );
  const [copying, setCopying] = useState(false);
  const [copyMessage, setCopyMessage] = useState('');
  async function copyNewLinks() {
    setCopying(true);
    setCopyMessage('');
    try {
      const data = await request<{ links: { url: string }[] }>(
        `/api/spy-library?${new URLSearchParams({ view: 'links', id, at, ...(fixture ? { fixture: 'page-history', day: fixtureDay } : {}) })}`,
      );
      await navigator.clipboard.writeText(data.links.map((ad) => ad.url).join('\n'));
      setCopyMessage(`${data.links.length} links copiados.`);
    } catch {
      setCopyMessage('Não foi possível copiar. Reabra a oferta e tente novamente.');
    } finally {
      setCopying(false);
    }
  }
  const offset = page.id === id && page.at === at ? page.offset : 0;
  const query = useQuery({
    queryKey: ['spy-saved-ads', user?.id, id, at, offset, kind, fixtureDay, all, creative],
    queryFn: () =>
      request<{
        ads: LibraryAd[];
        pages: LibraryPageSummary[];
        total: number;
        nextOffset: number | null;
        creativeSummary?: CreativeSummary;
      }>(
        `/api/spy-library?${new URLSearchParams({ view: kind, id, at, offset: String(offset), ...(!isPages && all ? { grouped: '1' } : {}), ...(!isPages && all && creative ? { creative } : {}), ...(!isPages && !all ? { highlights: '1' } : {}), ...(fixture ? { fixture: 'page-history', day: fixtureDay } : {}) })}`,
      ),
    enabled: !!user,
    staleTime: 15000,
    refetchInterval: 15000,
    retry: false,
  });
  return (
    <section
      className={s.section}
      aria-label={isPages ? 'Páginas encontradas no acompanhamento' : 'Todos os anúncios coletados'}
    >
      <h4>
        {isPages ? 'Páginas encontradas' : all ? 'Todos os anúncios' : 'Destaques por volume'}
      </h4>
      {!isPages && (
        <Link href={`/spy/analise-visual?${new URLSearchParams({ id, at })}`}>Comparação visual com IA</Link>
      )}
      {!isPages && !all && (
        <p className={s.muted}>
          Até 12 grupos com mais anúncios informados pela Library. Sem volume informado ficam ao
          final.
        </p>
      )}
      {query.isPending && <output>Carregando dados salvos…</output>}
      {query.isError && (
        <p role="alert">
          Não foi possível abrir esta página. Reabra a oferta para atualizar a leitura.
        </p>
      )}
      {query.data && (
        <>
          {!isPages && query.data.creativeSummary && (
            <div className={s.creativeEvidence}>
              <strong>Análise dos {query.data.creativeSummary.total} IDs novos</strong>
              <div className={s.actions}>
                {!all && (
                  <Link
                    className={s.collectionLink}
                    href={`/spy/anuncios?${new URLSearchParams({ id, at, creative: 'all-new', ...(fixture ? { fixture: 'page-history', day: fixtureDay } : {}) })}`}
                  >
                    Ver os {query.data.creativeSummary.total} anúncios novos e seus links
                  </Link>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={copyNewLinks}
                  disabled={copying || !query.data.creativeSummary.total}
                >
                  {copying
                    ? 'Copiando…'
                    : `Copiar todos os ${query.data.creativeSummary.total} links novos`}
                </Button>
              </div>
              <output>{copyMessage}</output>
              <p>
                {query.data.creativeSummary.new} novos no histórico ·{' '}
                {query.data.creativeSummary.duplicate} reutilizados ·{' '}
                {query.data.creativeSummary.variation} variações ·{' '}
                {query.data.creativeSummary.unverified} não confirmados
              </p>
              <p>
                {query.data.creativeSummary.candidates} não confirmados têm correspondência no
                histórico ou nesta coleta. Capa igual não confirma vídeo igual; novos IDs não
                significam novos criativos. Não identificamos a campanha de origem.
              </p>
              {all && (
                <Select
                  value={creative || 'all'}
                  onValueChange={(value) => {
                    setCreative(value === 'all' ? '' : (value as typeof creative));
                    setPage({ id, at, offset: 0 });
                  }}
                >
                  <SelectTrigger
                    className={s.selectTrigger}
                    aria-label="Filtrar classificação dos criativos"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os anúncios</SelectItem>
                    <SelectItem value="all-new">Somente IDs novos</SelectItem>
                    {Object.entries(creativeLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
          <p className={s.collectionSummary}>
            {query.data.total
              ? `${offset + 1}–${offset + (isPages ? query.data.pages.length : all ? query.data.ads.length : Math.min(12, query.data.ads.length))}`
              : '0'}{' '}
            de <strong>{query.data.total.toLocaleString('pt-BR')}</strong>{' '}
            {isPages ? 'páginas' : all ? 'grupos de mídia' : 'anúncios'}
            <span>Última coleta · {new Date(at).toLocaleString('pt-BR')}</span>
          </p>
          {!isPages && !all && (
            <Link
              className={s.collectionLink}
              href={`/spy/anuncios?${new URLSearchParams({ id, at, ...(fixture ? { fixture: 'page-history', day: fixtureDay } : {}) })}`}
            >
              Ver todos os {query.data.total.toLocaleString('pt-BR')} anúncios{' '}
              <ExternalLink size={14} />
            </Link>
          )}
          <ul
            className={isPages ? s.pageGrid : s.adGrid}
            aria-label={isPages ? 'Páginas anunciantes encontradas' : 'Anúncios desta página'}
          >
            {isPages
              ? query.data.pages.map((page) => (
                  <li className={s.pageCard} key={page.id} data-change={page.change}>
                    <div className={s.pageCardTop}>
                      <PageAvatar page={page} />
                      <strong>{page.pageName || 'Página sem nome informado'}</strong>
                    </div>
                    <small>ID {page.id}</small>
                    <a href={page.url} target="_blank" rel="noopener noreferrer">
                      Abrir página na Library <ExternalLink size={12} />
                    </a>
                    <div className={s.pageCount}>
                      <span className={s.readingIcon}>
                        <Layers3 size={18} aria-hidden="true" />
                      </span>
                      <div>
                        <small>Anúncios nesta página</small>
                        <strong>{page.adCount.toLocaleString('pt-BR')}</strong>
                      </div>
                      <span className={s.readingPill}>
                        {page.adCount === 0 ? 'Ausentes na leitura' : 'Na última coleta'}
                      </span>
                    </div>
                    <p className={s.pageChange}>
                      {page.change === 'new'
                        ? `Nova no Dia ${page.firstSeenDay}`
                        : page.change === 'returned'
                          ? 'Voltou a aparecer'
                          : page.change === 'missing'
                            ? 'Não retornou na última leitura'
                            : page.change === 'baseline'
                              ? 'Linha de base'
                              : 'Já acompanhada'}
                    </p>
                    <div className={s.pageDates}>
                      <small>Primeira aparição</small>
                      <span>
                        {page.firstSeenDay === 0 ? 'leitura inicial' : `Dia ${page.firstSeenDay}`} ·{' '}
                        {new Date(page.firstSeenAt).toLocaleString('pt-BR')}
                      </span>
                      <small>Última aparição</small>
                      <span>{new Date(page.lastSeenAt).toLocaleString('pt-BR')}</span>
                    </div>
                  </li>
                ))
              : (all ? query.data.ads : query.data.ads.slice(0, 12)).map((ad) => (
                  <AdVisualCard key={ad.id} ad={ad} />
                ))}
          </ul>
          {(isPages || all) && query.data.total > 50 && (
            <div className={s.actions}>
              <Button
                variant="outline"
                size="sm"
                disabled={!offset || query.isFetching}
                onClick={() => setPage({ id, at, offset: Math.max(0, offset - 50) })}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={query.data.nextOffset === null || query.isFetching}
                onClick={() => setPage({ id, at, offset: query.data!.nextOffset! })}
              >
                Próxima
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
