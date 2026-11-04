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
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-accent p-1.5">
        {openLink}
        <output className="sr-only">{isOpening ? 'Registrando abertura…' : ''}</output>
        <button
          type="button"
          disabled={saveResult.isPending}
          onClick={() => saveResult.mutate('worked')}
          className={cn(
            'rounded px-2 py-1 text-[10px] transition',
            link.manual_result === 'worked'
              ? 'bg-success/10 text-success'
              : 'bg-accent text-muted-foreground hover:text-success',
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
              ? 'bg-danger/10 text-danger'
              : 'bg-accent text-muted-foreground hover:text-danger',
          )}
        >
          × não funcionou
        </button>
        {link.manual_checked_at && (
          <span className="text-[9px] text-muted-foreground">
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
        <span className="text-xs text-warning">
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
        className="rounded-md border border-border px-2.5 py-1.5 text-primary"
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
        className="rounded-md border border-border bg-accent px-2.5 py-1.5 text-primary transition hover:bg-accent"
      >
        {link.name} · abrir teste
      </button>,
    );
  }
  if (validation.isLoading) {
    return withLastOpening(
      <span className="rounded-md border border-border px-2.5 py-1.5 text-muted-foreground">
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
        className="rounded-md border border-danger/30 bg-danger/10 px-2.5 py-1.5 text-danger transition hover:bg-danger/10"
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
      className="rounded-md border border-success/30 bg-success/10 px-2.5 py-1.5 text-success transition hover:bg-success/10"
    >
      {link.name} · elegível
    </button>,
  );
}
