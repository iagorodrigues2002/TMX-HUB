'use client';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api-client';
import { useState } from 'react';
import { toast } from 'sonner';

export function VendepayWebhook({
  offerId,
  connectionId,
}: { offerId: string; connectionId: string }) {
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const generate = async () => {
    if (!confirmed || pending) return;
    setPending(true);
    setError('');
    try {
      const result = await apiClient.rotateVendepayConnectionWebhook(offerId, connectionId);
      setUrl(result.vendepay_webhook_url);
      setConfirmed(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível gerar o webhook.');
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="space-y-3 border-t border-white/10 px-4 py-4 sm:px-5">
      <p className="text-sm font-medium">Webhook para cadastrar na VendePay</p>
      <p className="text-xs text-white/60">
        A URL só é exibida ao gerar. Gerar outra invalida a URL anterior desta conta; atualize o
        cadastro na VendePay imediatamente para continuar recebendo vendas.
      </p>
      {url ? (
        <>
          <p className="text-xs text-amber-200">Copie agora. A URL anterior foi desativada.</p>
          <code className="block break-all rounded-lg bg-black/25 p-3 text-xs text-cyan-100">
            {url}
          </code>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void navigator.clipboard.writeText(url).then(
                () => toast.success('Webhook copiado.'),
                () => toast.error('Não foi possível copiar. Selecione a URL e copie manualmente.'),
              );
            }}
          >
            Copiar webhook
          </Button>
        </>
      ) : (
        <>
          <label className="flex items-start gap-2 text-xs text-white/70">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={pending}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            Entendo que a URL anterior deixará de funcionar e vou atualizar a VendePay.
          </label>
          <Button
            type="button"
            variant="outline"
            disabled={!confirmed || pending}
            onClick={() => void generate()}
          >
            {pending ? 'Gerando…' : 'Gerar nova URL do webhook'}
          </Button>
        </>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-200">
          {error}
        </p>
      )}
    </div>
  );
}
