'use client';

import { Button } from '@/components/ui/button';
import { authToken, request } from '@/lib/api-client/request';
import { useEffect, useState } from 'react';

type ExtensionRuntime = {
  sendMessage: (id: string, message: object, done: (value?: { ok?: boolean }) => void) => void;
  lastError?: { message?: string };
};

export default function ConnectVault() {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!authToken.get()) {
      window.location.replace(
        '/login?next=' + encodeURIComponent(location.pathname + location.search),
      );
      return;
    }
    setReady(true);
  }, []);

  async function connect() {
    const query = new URLSearchParams(location.search);
    const challenge = query.get('challenge') || '';
    const state = query.get('state') || '';
    const redirect = query.get('redirect') || '';
    if (
      !/^[A-Za-z0-9_-]{43}$/.test(state) ||
      !/^https:\/\/[a-p]{32}\.chromiumapp\.org\/tmx-vault$/.test(redirect)
    ) {
      setError('Solicitação de conexão inválida.');
      return;
    }
    setBusy(true);
    try {
      const { code } = await request<{ code: string }>('/v1/vault-extension/authorize', {
        method: 'POST',
        body: { challenge, redirect },
      });
      const url = new URL(redirect);
      if (query.get('mode') === 'tab') {
        const runtime = (window as Window & { chrome?: { runtime?: ExtensionRuntime } }).chrome
          ?.runtime;
        if (!runtime) throw new Error('Extensão indisponível.');
        const extension = url.hostname.split('.')[0]!;
        await new Promise<void>((resolve, reject) => {
          runtime.sendMessage(
            extension,
            { type: 'tmx-vault-authorized', code, state },
            (response) => {
              if (runtime.lastError || !response?.ok) reject(new Error('Conexão recusada.'));
              else resolve();
            },
          );
        });
        return;
      }
      url.hash = new URLSearchParams({ code, state }).toString();
      window.location.replace(url);
    } catch {
      setError('Não foi possível autorizar o Cofre. Confira sua sessão e o vínculo com a empresa.');
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">Conectar o Cofre TMX</h1>
      <p className="text-muted-foreground">
        Autorize a extensão a usar os logins liberados para a sua conta.
      </p>
      <Button disabled={!ready || busy} onClick={() => void connect()}>
        Autorizar extensão
      </Button>
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
