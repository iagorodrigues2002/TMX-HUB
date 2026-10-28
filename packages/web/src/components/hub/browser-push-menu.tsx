'use client';

import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { authToken, request } from '@/lib/api-client/request';
import {
  browserPushId,
  browserPushSupported,
  disableBrowserPush,
  pushDeviceSession,
  withPushDeviceLock,
} from '@/lib/browser-push';
import { BellRing } from 'lucide-react';
import { useEffect, useState } from 'react';

export function BrowserPushMenu({ userId }: { userId: string }) {
  const [enabled, setEnabled] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  const [supported, setSupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!userId) return;
    setEnabled(false);
    setKey(null);
    let stopped = false;
    setSupported(browserPushSupported());
    if (!browserPushSupported()) return;
    void (async () => {
      const registration = await navigator.serviceWorker.getRegistration('/');
      const sub = await registration?.pushManager.getSubscription();
      const query = sub ? `?id=${await browserPushId(sub)}` : '';
      const config = await request<{
        configured: boolean;
        public_key: string | null;
        enabled: boolean;
      }>(`/v1/tracking/browser-push${query}`);
      if (stopped) return;
      setKey(config.configured ? config.public_key : null);
      setEnabled(!!sub && config.enabled && Notification.permission === 'granted');
    })().catch(() => {
      if (!stopped) setError('Não foi possível consultar as notificações deste dispositivo.');
    });
    return () => {
      stopped = true;
    };
  }, [userId]);
  const toggle = async () => {
    setBusy(true);
    setError('');
    try {
      if (enabled) {
        await disableBrowserPush();
        setEnabled(false);
        return;
      }
      if (!key) return;
      const token = authToken.get();
      if (!token) throw new Error('Entre novamente na sua conta para ativar.');
      // Browser permission is requested only from this explicit user click.
      const permission = await Notification.requestPermission();
      if (permission !== 'granted')
        throw new Error('Permita notificações nas configurações do navegador para ativar.');
      await withPushDeviceLock(async () => {
        if (authToken.get() !== token)
          throw new Error('A sessão mudou. Ative novamente na conta atual.');
        await navigator.serviceWorker.register('/tmx-push-sw.js', { scope: '/' });
        const registration = await navigator.serviceWorker.ready;
        const raw = atob(key.replace(/-/g, '+').replace(/_/g, '/'));
        const applicationServerKey = Uint8Array.from(raw, (char) => char.charCodeAt(0));
        let subscription = await registration.pushManager.getSubscription();
        // A previous account cannot silently bind its notification device to this one.
        if (subscription) {
          await pushDeviceSession(registration, null);
          await subscription.unsubscribe();
          subscription = null;
        }
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
        try {
          await request('/v1/tracking/browser-push', {
            method: 'PUT',
            body: subscription.toJSON(),
            headers: { Authorization: `Bearer ${token}` },
          });
          if (authToken.get() !== token)
            throw new Error('A sessão mudou. Ative novamente na conta atual.');
          await pushDeviceSession(registration, userId);
        } catch (error) {
          await subscription.unsubscribe();
          throw error;
        }
        setEnabled(true);
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Falha ao configurar as notificações.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <DropdownMenuItem
        disabled={busy || !supported || (!key && !enabled)}
        className="h-11 cursor-pointer px-3 text-[13px]"
        onSelect={(event) => {
          event.preventDefault();
          void toggle();
        }}
      >
        <BellRing aria-hidden />{' '}
        {busy ? 'Configurando…' : `Fora do TMX: ${enabled ? 'ligadas' : 'desligadas'}`}
      </DropdownMenuItem>
      {!supported && (
        <p className="px-3 py-1 text-xs text-muted-foreground">
          Push indisponível neste navegador. No iPhone, use o TMX adicionado à Tela de Início.
        </p>
      )}
      {supported && !key && (
        <p className="px-3 py-1 text-xs text-muted-foreground">
          Push aguardando configuração do servidor.
        </p>
      )}
      {error && (
        <p role="alert" className="px-3 py-1 text-xs text-destructive">
          {error}
        </p>
      )}
    </>
  );
}
