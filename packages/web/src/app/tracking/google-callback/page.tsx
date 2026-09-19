'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';

export default function GoogleCallback() {
  const started = useRef(false);
  const [message, setMessage] = useState('Concluindo autorização com o Google…');
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const query = new URLSearchParams(window.location.search);
    // Remove OAuth material before further navigation or rendering links.
    window.history.replaceState(null, '', '/tracking/google-callback');
    void (async () => {
      try {
        const saved = JSON.parse(sessionStorage.getItem('tmx-google-oauth') || 'null');
        sessionStorage.removeItem('tmx-google-oauth');
        if (query.get('error')) throw new Error('A autorização não foi concluída no Google.');
        if (!saved || !query.get('code') || query.get('state') !== saved.state) {
          throw new Error('Esta autorização expirou ou foi aberta em outro navegador. Inicie novamente pelo destino da oferta.');
        }
        await apiClient.googleAdsOAuthComplete(saved.offerId, saved.destinationId, { code: query.get('code')!, state: saved.state });
        setMessage('Autorização salva. A validação da conta é a próxima etapa; os envios continuam desativados.');
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Não foi possível conectar. Inicie novamente pelo TMX.');
      }
    })();
  }, []);
  return <main className="mx-auto max-w-xl space-y-6 p-8"><h1 className="text-xl font-semibold">Conexão Google Ads</h1><p role="status">{message}</p><Link className="underline" href="/tracking">Voltar ao tracking</Link></main>;
}
