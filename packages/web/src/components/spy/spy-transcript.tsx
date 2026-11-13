'use client';
import styles from '@/app/spy/analise-visual/visual.module.css';
import { request } from '@/lib/api-client/request';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

type Transcript = {
  missing?: boolean;
  text?: string;
  cached?: boolean;
  at?: string;
  costMicros?: number;
  costReserved?: boolean;
  analysis?: { kind: string; description: string };
};
export function SpyTranscript({
  endpoint,
  companyId,
  userId,
  adId,
  referenceId,
  hasAudio,
}: {
  endpoint: string;
  companyId: string;
  userId: string;
  adId: string;
  referenceId?: string;
  hasAudio: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [generated, setGenerated] = useState<Transcript>();
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const body = { action: 'transcribe', adId, ...(referenceId ? { referenceId } : {}) };
  const saved = useQuery({
    queryKey: ['spy-transcript', companyId, userId, endpoint, adId, referenceId],
    queryFn: () =>
      request<Transcript>(endpoint, { method: 'POST', body: { ...body, cachedOnly: true } }),
    enabled: hasAudio,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  });
  const transcript = generated ?? saved.data;
  async function transcribe() {
    setBusy(true);
    setError('');
    try {
      setGenerated(await request<Transcript>(endpoint, { method: 'POST', body }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível transcrever.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className={styles.transcript}
      aria-label={`Transcrição do anúncio ${referenceId ?? adId}`}
    >
      <header>
        <h3>Áudio e transcrição</h3>
        {transcript?.text !== undefined && <span className={styles.badge}>Salva</span>}
      </header>
      {!hasAudio ? (
        <p>Anúncio sem vídeo para transcrição.</p>
      ) : transcript?.text !== undefined ? (
        <>
          {transcript.analysis && <p>{transcript.analysis.description}</p>}
          {['music', 'silence'].includes(transcript.analysis?.kind ?? '') ? (
            <p>
              {transcript.analysis?.kind === 'music'
                ? 'Música identificada · sem transcrição de letra.'
                : 'Sem fala identificada.'}
            </p>
          ) : (
            <textarea
              className={styles.transcriptText}
              readOnly
              rows={8}
              aria-label="Texto da transcrição"
              value={transcript.text || 'Nenhuma fala identificada no áudio.'}
            />
          )}
          <footer>
            <small>
              {transcript.costReserved ? 'Custo estimado' : 'Custo original'} US${' '}
              {((transcript.costMicros ?? 0) / 1000000).toFixed(4)} · sem nova cobrança ao reabrir
            </small>
            {!!transcript.text && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(transcript.text!);
                    setCopied(true);
                  } catch {
                    setError('Não foi possível copiar. Selecione o texto para copiar.');
                  }
                }}
              >
                {copied ? 'Copiado' : 'Copiar texto'}
              </button>
            )}
          </footer>
        </>
      ) : (
        <>
          <p>
            {busy
              ? 'Identificando fala e música…'
              : saved.isPending
                ? 'Carregando transcrição salva…'
                : 'O texto falado no vídeo aparece aqui após a primeira transcrição.'}
          </p>
          <button
            type="button"
            disabled={busy || saved.isPending || !!saved.error}
            onClick={transcribe}
          >
            {busy ? 'Analisando…' : 'Analisar áudio'}
          </button>
          <small>
            A primeira análise usa a IA da empresa. Música sem locução não gera transcrição.
          </small>
        </>
      )}
      {(error || saved.error) && <p role="alert">{error || saved.error?.message}</p>}
    </section>
  );
}
