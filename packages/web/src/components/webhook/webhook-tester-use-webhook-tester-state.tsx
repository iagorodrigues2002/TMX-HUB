'use client';

import { apiClient } from '@/lib/api-client';
import { getPersonalStorageOwner } from '@/lib/personal-storage';
import { hmacHex } from '@/lib/webhook/hmac';
import { type WebhookHistoryEntry, listHistory, pushHistory } from '@/lib/webhook/storage';
import {
  WEBHOOK_PLATFORMS,
  type WebhookPlatform,
  findTemplate,
  platformOf,
} from '@/lib/webhook/templates';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

export function useWebhookTesterState() {
  const [platform, setPlatform] = useState<WebhookPlatform>('hotmart');
  const [templateId, setTemplateId] = useState<string>('hotmart.purchase_approved');
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [headersText, setHeadersText] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [hmacInfo, setHmacInfo] = useState<{
    header: string;
    algorithm: 'sha256' | 'sha1';
    prefix?: string;
  } | null>(null);

  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof apiClient.fireWebhook>> | null>(
    null,
  );
  const [history, setHistory] = useState<WebhookHistoryEntry[]>([]);

  useEffect(() => setHistory(listHistory()), []);

  const platformDef = useMemo(() => WEBHOOK_PLATFORMS.find((p) => p.id === platform), [platform]);

  // Loading a template fills the editable fields.
  const loadTemplate = useCallback((id: string) => {
    setTemplateId(id);
    const t = findTemplate(id);
    if (!t) return;
    setHeadersText(JSON.stringify(t.headers, null, 2));
    setBodyText(JSON.stringify(t.body, null, 2));
    setHmacInfo(t.hmac ?? null);
  }, []);

  // Switching platform → load first template of new platform.
  const switchPlatform = (p: WebhookPlatform) => {
    setPlatform(p);
    const def = WEBHOOK_PLATFORMS.find((x) => x.id === p);
    const first = def?.templates[0];
    if (first) loadTemplate(first.id);
  };

  // Initial load.
  useEffect(() => {
    loadTemplate('hotmart.purchase_approved');
  }, [loadTemplate]);

  // Keep platform select in sync if user picks a template from another group.
  useEffect(() => {
    const p = platformOf(templateId);
    if (p && p !== platform) setPlatform(p);
  }, [templateId, platform]);

  const handleFire = async () => {
    const requestOwner = getPersonalStorageOwner();
    if (!requestOwner) return;
    if (!url.trim()) {
      toast.error('Cole a URL do webhook destino.');
      return;
    }
    let parsedHeaders: Record<string, string> = {};
    try {
      parsedHeaders = headersText.trim() ? JSON.parse(headersText) : {};
    } catch {
      toast.error('Headers não são JSON válido.');
      return;
    }
    let parsedBody: unknown;
    try {
      parsedBody = bodyText.trim() ? JSON.parse(bodyText) : {};
    } catch {
      toast.error('Body não é JSON válido.');
      return;
    }

    setSending(true);
    setResult(null);
    try {
      // Sign before sending, but keep crypto failures inside the visible error boundary.
      if (hmacInfo && secret.trim()) {
        const bodyStr = JSON.stringify(parsedBody);
        const digest = await hmacHex(hmacInfo.algorithm, secret.trim(), bodyStr);
        if (requestOwner !== getPersonalStorageOwner()) return;
        const value = hmacInfo.prefix ? `${hmacInfo.prefix}${digest}` : digest;
        parsedHeaders[hmacInfo.header] = value;
      }
      const res = await apiClient.fireWebhook({
        url: url.trim(),
        method: 'POST',
        headers: parsedHeaders,
        body: parsedBody,
      });
      if (requestOwner !== getPersonalStorageOwner()) return;
      setResult(res);
      pushHistory({
        templateId,
        url: url.trim(),
        status: res.status,
        ok: res.ok,
        durationMs: res.duration_ms,
      });
      setHistory(listHistory());
      if (res.ok) toast.success(`HTTP ${res.status} em ${res.duration_ms}ms`);
      else if (res.status > 0) toast.error(`HTTP ${res.status} em ${res.duration_ms}ms`);
      else toast.error(res.error ?? 'Falha ao chamar destino');
    } catch (err) {
      if (requestOwner !== getPersonalStorageOwner()) return;
      toast.error((err as Error).message);
    } finally {
      setSending(false);
    }
  };
  return {
    platform,
    templateId,
    url,
    setUrl,
    secret,
    setSecret,
    headersText,
    setHeadersText,
    bodyText,
    setBodyText,
    hmacInfo,
    sending,
    result,
    history,
    setHistory,
    platformDef,
    loadTemplate,
    switchPlatform,
    handleFire,
  };
}
