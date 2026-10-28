'use client';
import type { UpsellLastOpening } from '@/components/tracking/upsell-audit-presentation';
import { safeUpsellDestination } from '@/components/tracking/upsell-audit-presentation';
import { upsellLastOpeningLabel } from '@/components/tracking/upsell-audit-presentation';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import { useMutation } from '@tanstack/react-query';
import { useRef } from 'react';
import { useState } from 'react';
import { toast } from 'sonner';
export function ValidatedUpsellLink({
  offerId,
  orderId,
  link,
}: {
  offerId: string;
  orderId: string;
  link: {
    gateway?: string;
    stage_id: string;
    name: string;
    already_purchased: boolean;
    url: string;
    force_url: string | null;
    manual_result: 'worked' | 'failed' | null;
    manual_checked_at: string | null;
    last_opening?: UpsellLastOpening | null;
  };
}) {
  const qc = useQueryClient();
  const opening = useRef(false);
  const clickId = useRef<string | null>(null);
  const [isOpening, setIsOpening] = useState(false);
  const openAudited = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (opening.current) return;
    // Reserve the tab during the user gesture; a blocked popup must not create an audit opening.
    const popup = window.open('about:blank', '_blank');
    if (!popup) {
      toast.error('Permita abrir uma nova aba para acessar este upsell.');
      return;
    }
    popup.opener = null;
    const referrerPolicy = popup.document.createElement('meta');
    referrerPolicy.name = 'referrer';
    referrerPolicy.content = 'no-referrer';
    popup.document.head.appendChild(referrerPolicy);
    opening.current = true;
    setIsOpening(true);
    clickId.current ??= crypto.randomUUID();
    try {
      const response = await apiClient.openTrackingUpsell(
        offerId,
        orderId,
        link.stage_id,
        clickId.current,
        link.already_purchased || Boolean(link.force_url),
      );
      const destination = safeUpsellDestination(response.url);
      if (popup.closed) throw new Error('A nova aba foi fechada. Tente novamente.');
      popup.location.replace(destination);
      clickId.current = null;
      void qc.invalidateQueries({ queryKey: ['upsell-operator-logs', offerId] });
      void qc.invalidateQueries({ queryKey: ['tracking-upsell-identities', offerId] });
    } catch (error) {
      popup.close();
      toast.error(
        (error as Error).message || 'Não foi possível registrar a abertura. Tente novamente.',
      );
    } finally {
      opening.current = false;
      setIsOpening(false);
    }
  };
  const validation = useQuery<{
    compatible: boolean;
    reason: string | null;
    url?: string;
    state?: 'recoverable' | 'already_converted' | 'temporary_failure' | 'definitive_failure';
  }>({
    queryKey: ['upsell-compatibility', link.stage_id, link.url],
    queryFn: () =>
      link.gateway === 'syzepay'
        ? apiClient.checkSyzepayUpsell(offerId, orderId, link.stage_id)
        : apiClient.checkTrackingUpsellCompatibility(link.url),
    // Opening revalidates on the server; don't poll every visible buyer/stage in the background.
    staleTime: 300_000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    refetchInterval: false,
    retry: false,
    enabled: !link.force_url && !link.already_purchased,
  });
  const saveResult = useMutation({
    mutationFn: (result: 'worked' | 'failed') =>
      apiClient.saveTrackingUpsellManualResult(offerId, orderId, link.stage_id, result),
    onSuccess: (_response, result) => {
      void qc.invalidateQueries({ queryKey: ['tracking-upsell-identities', offerId] });
      toast.success(
        result === 'worked'
          ? 'Retorno manual registrado. A compra só é confirmada pelo webhook.'
          : 'Falha manual registrada.',
      );
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const withLastOpening = (content: React.ReactNode) => (
    <div className="flex min-w-0 flex-col items-start gap-1">
      {content}
      <span
        className="line-clamp-2 h-8 max-w-full break-words text-[10px] leading-4 text-muted-foreground"
        title={upsellLastOpeningLabel(link.last_opening)}
      >
        {upsellLastOpeningLabel(link.last_opening)}
      </span>
    </div>
  );
  const withManualResult = (openLink: React.ReactNode) =>
    withLastOpening(
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-cyan-300/15 bg-cyan-300/[0.04] p-1.5">
        {openLink}
        <output className="sr-only">{isOpening ? 'Registrando abertura…' : ''}</output>
        <button
          type="button"
          disabled={saveResult.isPending}
          onClick={() => saveResult.mutate('worked')}
          className={cn(
            'rounded px-2 py-1 text-[10px] transition',
            link.manual_result === 'worked'
              ? 'bg-emerald-300/20 text-emerald-100'
              : 'bg-white/[0.05] text-white/45 hover:text-emerald-200',
          )}
        >
          ✓ funcionou
        </button>
        <button
          type="button"
          disabled={saveResult.isPending}
          onClick={() => saveResult.mutate('failed')}
          className={cn(
            'rounded px-2 py-1 text-[10px] transition',
            link.manual_result === 'failed'
              ? 'bg-rose-300/20 text-rose-100'
              : 'bg-white/[0.05] text-white/45 hover:text-rose-200',
          )}
        >
          × não funcionou
        </button>
        {link.manual_checked_at && (
          <span className="text-[9px] text-white/30">
            {new Date(link.manual_checked_at).toLocaleString('pt-BR', {
              timeZone: 'America/Sao_Paulo',
            })}
          </span>
        )}
      </div>,
    );
  if (link.already_purchased) {
    return withLastOpening(
      <button
        type="button"
        disabled={isOpening}
        onClick={(event) => void openAudited(event)}
        aria-busy={isOpening}
        aria-label={`Abrir ${link.name}, já comprado`}
        title="Este upsell já foi comprado. Clique para abrir a página mesmo assim."
        className="cursor-pointer rounded-md border border-violet-300/25 bg-violet-300/[0.08] px-2.5 py-1.5 text-violet-100 underline decoration-violet-300/40 underline-offset-2 transition hover:border-violet-300/40 hover:bg-violet-300/[0.16]"
      >
        {link.name} · já comprado · abrir
      </button>,
    );
  }
  if (link.gateway === 'syzepay') {
    const syzeValidation = validation.data as
      | { compatible?: boolean; url?: string; reason?: string }
      | undefined;
    if (!syzeValidation?.compatible || !syzeValidation.url)
      return withLastOpening(
        <span className="text-xs text-amber-100/60">
          {validation.isFetching
            ? 'Validando sessão SyzePay…'
            : (syzeValidation?.reason ?? 'Sessão SyzePay indisponível')}
        </span>,
      );
    return withManualResult(
      <button
        type="button"
        disabled={isOpening}
        onClick={(event) => void openAudited(event)}
        aria-busy={isOpening}
        title="Sessão e página confirmadas na SyzePay. A cobrança exige aceitar a oferta na página."
        className="rounded-md border border-cyan-300/25 px-2.5 py-1.5 text-cyan-100"
      >
        {link.name} · SyzePay · abrir
      </button>,
    );
  }
  if (link.force_url) {
    return withManualResult(
      <button
        type="button"
        disabled={isOpening}
        onClick={(event) => void openAudited(event)}
        aria-busy={isOpening}
        title="Abre a página mesmo sem a validação prévia da VendePay"
        className="rounded-md border border-cyan-300/25 bg-cyan-300/[0.08] px-2.5 py-1.5 text-cyan-100 transition hover:bg-cyan-300/[0.16]"
      >
        {link.name} · abrir teste
      </button>,
    );
  }
  if (validation.isLoading) {
    return withLastOpening(
      <span className="rounded-md border border-white/10 px-2.5 py-1.5 text-white/40">
        {link.name} · verificando
      </span>,
    );
  }
  if (!validation.data?.compatible) {
    const accountMissing = validation.data?.reason === 'account_not_configured';
    return withManualResult(
      <button
        type="button"
        disabled={isOpening}
        onClick={(event) => void openAudited(event)}
        aria-busy={isOpening}
        title={
          accountMissing
            ? 'Cadastre a URL desta etapa para a conta VendePay do comprador'
            : 'Abrir para testar novamente na VendePay'
        }
        className="rounded-md border border-rose-300/20 bg-rose-300/[0.06] px-2.5 py-1.5 text-rose-200/70 transition hover:bg-rose-300/[0.12]"
      >
        {link.name} · {accountMissing ? 'conta sem URL' : 'indisponível'}
      </button>,
    );
  }
  return withManualResult(
    <button
      type="button"
      disabled={isOpening}
      onClick={(event) => void openAudited(event)}
      aria-busy={isOpening}
      title="Elegibilidade confirmada; o TMX validará novamente ao abrir"
      className="rounded-md border border-emerald-300/25 bg-emerald-300/[0.08] px-2.5 py-1.5 text-emerald-100 transition hover:bg-emerald-300/[0.16]"
    >
      {link.name} · elegível
    </button>,
  );
}
