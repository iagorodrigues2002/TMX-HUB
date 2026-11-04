'use client';

import { formatCurrency } from '@/components/dashboard/kpi-cards';
import { authToken } from '@/lib/api-client/request';
import { useAuth } from '@/lib/auth-context';
import { todayIso } from '@/lib/date-range';
import { useInterfaceEffects } from '@/lib/interface-effects';
import { usePrivacy } from '@/lib/privacy-context';
import { type SaleNotice, consumeSaleNoticeStream } from '@/lib/sale-notice-stream';
import {
  canClaimSaleNotice,
  canPlaySaleNoticeSound,
  enqueueSaleNotices,
  saleNoticeTotals,
  takeNewApproved,
} from '@/lib/sale-notification';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { getSaleNoticePreference } from './sale-notice-scope-menu';

type Notice = SaleNotice;

export function SaleNotifications() {
  const { user } = useAuth();
  const { data: preference } = useQuery({
    queryKey: ['sale-notice-preferences', user?.id],
    queryFn: getSaleNoticePreference,
    enabled: false,
  });
  const selection = JSON.stringify(preference?.offer_ids ?? null);
  const { isPrivate } = usePrivacy();
  const {
    sound,
    alerts: enabled,
    audio,
    audioBuffer,
    playing,
    gain,
    soundPending,
    testRequest,
  } = useInterfaceEffects();
  const [queue, setQueue] = useState<Notice[][]>([]);
  const [failed, setFailed] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const principal = user ? `${user.id}:${user.role}` : null;
  const active = queue[0];
  const first = active?.[0];
  const totals = saleNoticeTotals(active ?? []);
  const lastTest = useRef(0);
  const lastSoundNotice = useRef<string | null>(null);
  useEffect(() => {
    if (!testRequest || testRequest === lastTest.current) return;
    lastTest.current = testRequest;
    setQueue((current) =>
      current.length
        ? current
        : enqueueSaleNotices(current, [
            {
              id: `preview-${testRequest}`,
              status: 'paid',
              occurred_at: new Date().toISOString(),
              provider: 'Prévia local · nenhum envio',
              offerName: 'TESTE · Venda demonstrativa',
              offerId: '',
              amount_minor: '2900',
              currency: 'BRL',
              test: true,
            },
          ]),
    );
  }, [testRequest]);

  useEffect(() => {
    if (!principal || !enabled || selection === '[]') return;
    let startedAt: number | undefined;
    const seen = new Set<string>();
    let cursor: string | undefined;
    let delay = 1000;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController;
    const connect = async () => {
      controller = new AbortController();
      const watchdog = setInterval(() => {
        if (Date.now() - lastMessage > 35_000) controller.abort();
      }, 5000);
      let lastMessage = Date.now();
      try {
        const token = authToken.get();
        const query = cursor ? `?${new URLSearchParams({ since: cursor })}` : '';
        const response = await fetch(`/v1/tracking/sale-notices/stream${query}`, {
          headers: {
            Accept: 'text/event-stream',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          cache: 'no-store',
          signal: controller.signal,
        });
        if (response.status === 400) cursor = undefined;
        if (!response.ok || !response.body) throw new Error('sale_notice_stream_unavailable');
        await consumeSaleNoticeStream(response.body, async (message) => {
          if (stopped) return;
          lastMessage = Date.now();
          delay = 1000;
          setFailed(false);
          startedAt ??= Date.parse(message.at);
          cursor ??= message.at;
          setQueue((current) =>
            current
              .map((batch) => {
                const allowed = batch.filter(
                  (notice) => notice.test || message.offer_ids.includes(notice.offerId),
                );
                return allowed.length === batch.length ? batch : allowed;
              })
              .filter((batch) => batch.length),
          );
          if (message.type !== 'sales') return;
          // A background tab must not consume the shared dedupe entry before a visible popup.
          if (!canClaimSaleNotice(document.visibilityState === 'visible', document.hasFocus()))
            return;
          const deliver = async () => {
            if (
              stopped ||
              !canClaimSaleNotice(document.visibilityState === 'visible', document.hasFocus())
            )
              return false;
            const storageKey = `tmx-sales-seen:${principal}:${todayIso()}`;
            // Storage restrictions must not turn a working stream into a retry loop.
            try {
              const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
              if (Array.isArray(stored))
                for (const id of stored) if (typeof id === 'string') seen.add(id);
            } catch {
              /* In-memory deduplication remains active. */
            }
            const fresh = takeNewApproved(message.items, seen, startedAt!, Date.parse(message.at));
            try {
              localStorage.setItem(storageKey, JSON.stringify([...seen]));
            } catch {
              /* See above. */
            }
            if (fresh.length) setQueue((current) => enqueueSaleNotices(current, fresh));
            return true;
          };
          // Lock only the delivery, so another tab never waits on a long-lived stream.
          const claimed = navigator.locks
            ? await navigator.locks.request(`tmx-sales:${principal}`, deliver)
            : await deliver();
          if (claimed && message.cursor) cursor = message.cursor;
        });
      } catch {
        if (!stopped) setFailed(true);
        delay = Math.min(delay * 2, 10_000);
      } finally {
        clearInterval(watchdog);
        if (!stopped) timer = setTimeout(connect, delay);
      }
    };
    void connect();
    const reconnectVisible = () => {
      if (document.visibilityState === 'visible' && document.hasFocus()) controller?.abort();
    };
    window.addEventListener('focus', reconnectVisible);
    document.addEventListener('visibilitychange', reconnectVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      controller?.abort();
      window.removeEventListener('focus', reconnectVisible);
      document.removeEventListener('visibilitychange', reconnectVisible);
      setQueue([]);
      playing.current?.stop();
      playing.current = null;
    };
  }, [principal, enabled, selection, playing]);

  useEffect(() => {
    if (!active) return;
    setLeaving(false);
    const id = active[0]!.id;
    const previousId = lastSoundNotice.current;
    if (
      canPlaySaleNoticeSound({
        id,
        previousId,
        visible: document.visibilityState === 'visible',
        focused: document.hasFocus(),
        enabled: sound && !soundPending,
      }) &&
      audio.current?.state === 'running' &&
      audioBuffer.current &&
      gain.current
    ) {
      const context = audio.current;
      playing.current?.stop();
      const source = context.createBufferSource();
      source.buffer = audioBuffer.current;
      source.connect(gain.current);
      playing.current = source;
      source.onended = () => {
        source.disconnect();
        if (playing.current === source) playing.current = null;
      };
      source.start();
      lastSoundNotice.current = id;
    }
    const silenceHiddenTab = () => {
      if (document.visibilityState === 'visible' && document.hasFocus()) return;
      playing.current?.stop();
      playing.current = null;
    };
    document.addEventListener('visibilitychange', silenceHiddenTab);
    window.addEventListener('blur', silenceHiddenTab);
    const timer = setTimeout(() => setLeaving(true), 3000);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', silenceHiddenTab);
      window.removeEventListener('blur', silenceHiddenTab);
    };
  }, [active, audio, audioBuffer, gain, playing, soundPending, sound]);

  useEffect(() => {
    if (!leaving || !active) return;
    const batch = active;
    const timer = setTimeout(() => {
      setQueue((current) => current.filter((notice) => notice !== batch));
      setLeaving(false);
    }, 160);
    return () => clearTimeout(timer);
  }, [leaving, active]);

  if (!user) return null;
  return (
    <div className="fixed top-16 right-3 z-50 flex max-w-[calc(100vw-24px)] flex-col items-end gap-2">
      {active && first && (
        <output
          key={first.id}
          data-leaving={leaving}
          aria-live="polite"
          className="tmx-sale-notice w-80 max-w-full rounded-xl border border-success/30 bg-background p-4 text-foreground shadow-xl"
        >
          <div className="flex items-center justify-between gap-3">
            <strong className="flex items-center gap-2 text-success">
              <span className="tmx-sale-confirm" aria-hidden="true">
                ✓
              </span>
              {first.test
                ? 'TESTE · Notificação'
                : active.length > 1
                  ? `${active.length} vendas aprovadas`
                  : 'Venda aprovada'}
            </strong>
            <button
              type="button"
              aria-label="Fechar aviso de venda"
              onClick={() => setLeaving(true)}
            >
              ✕
            </button>
          </div>
          <p className="mt-2 break-words">
            {active.length === 1
              ? first.offerName
              : `${active.length} vendas · ${new Set(active.map((notice) => notice.offerId)).size} oferta(s)`}
          </p>
          <div className="mt-1 text-xl font-semibold">
            {isPrivate
              ? '••••'
              : totals.totals.map(([currency, amount]) => (
                  <p key={currency}>{formatCurrency(amount / 100, currency)}</p>
                ))}
          </div>
          {!isPrivate && totals.unknown > 0 && (
            <p className="text-xs text-muted-foreground">
              {totals.unknown} venda(s) com valor indisponível
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            {active.length === 1 ? first.provider : 'Vendas agrupadas · um único aviso sonoro'}
          </p>
          {queue[1] && (
            <p className="mt-2 text-xs text-success">
              +{queue[1].length} venda(s) no próximo aviso
            </p>
          )}
        </output>
      )}
      {failed && (
        <output className="rounded bg-background p-2 text-xs text-warning">
          Avisos temporariamente indisponíveis.
        </output>
      )}
    </div>
  );
}
