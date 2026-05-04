'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Send, Trash2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { hmacHex } from '@/lib/webhook/hmac';
import {
  type WebhookHistoryEntry,
  clearHistory,
  listHistory,
  pushHistory,
} from '@/lib/webhook/storage';
import {
  WEBHOOK_PLATFORMS,
  type WebhookPlatform,
  findTemplate,
  platformOf,
} from '@/lib/webhook/templates';

const SELECT_CLASS =
  'flex h-11 w-full rounded-md border border-white/[0.10] bg-white/[0.04] px-4 text-[14px] text-white focus-visible:outline-none focus-visible:border-cyan-300/40';

export function WebhookTester() {
  const [platform, setPlatform] = useState<WebhookPlatform>('hotmart');
  const [templateId, setTemplateId] = useState<string>('hotmart.purchase_approved');
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [headersText, setHeadersText] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [hmacInfo, setHmacInfo] = useState<{ header: string; algorithm: 'sha256' | 'sha1'; prefix?: string } | null>(null);

  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof apiClient.fireWebhook>> | null>(
    null,
  );
  const [history, setHistory] = useState<WebhookHistoryEntry[]>([]);

  useEffect(() => setHistory(listHistory()), []);

  const platformDef = useMemo(
    () => WEBHOOK_PLATFORMS.find((p) => p.id === platform),
    [platform],
  );

  // Loading a template fills the editable fields.
  const loadTemplate = (id: string) => {
    setTemplateId(id);
    const t = findTemplate(id);
    if (!t) return;
    setHeadersText(JSON.stringify(t.headers, null, 2));
    setBodyText(JSON.stringify(t.body, null, 2));
    setHmacInfo(t.hmac ?? null);
  };

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
  }, []);

  // Keep platform select in sync if user picks a template from another group.
  useEffect(() => {
    const p = platformOf(templateId);
    if (p && p !== platform) setPlatform(p);
  }, [templateId, platform]);

  const handleFire = async () => {
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

    // If template defines an HMAC scheme and user provided a secret, sign and
    // inject the signature header before firing.
    if (hmacInfo && secret.trim()) {
      const bodyStr = JSON.stringify(parsedBody);
      const digest = await hmacHex(hmacInfo.algorithm, secret.trim(), bodyStr);
      const value = hmacInfo.prefix ? `${hmacInfo.prefix}${digest}` : digest;
      parsedHeaders[hmacInfo.header] = value;
    }

    setSending(true);
    setResult(null);
    try {
      const res = await apiClient.fireWebhook({
        url: url.trim(),
        method: 'POST',
        headers: parsedHeaders,
        body: parsedBody,
      });
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
      toast.error((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Section 1: platform + template */}
      <section className="glass-card space-y-4 p-6">
        <header>
          <p className="hud-label">1 · Plataforma + evento</p>
          <h2 className="mt-1 text-[16px] font-semibold text-white">
            Escolha a plataforma e o template
          </h2>
        </header>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label className="hud-label">Plataforma</Label>
            <select
              className={SELECT_CLASS}
              value={platform}
              onChange={(e) => switchPlatform(e.target.value as WebhookPlatform)}
            >
              {WEBHOOK_PLATFORMS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label className="hud-label">Evento (template)</Label>
            <select
              className={SELECT_CLASS}
              value={templateId}
              onChange={(e) => loadTemplate(e.target.value)}
            >
              {(platformDef?.templates ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Section 2: target + auth */}
      <section className="glass-card space-y-4 p-6">
        <header>
          <p className="hud-label">2 · Destino</p>
          <h2 className="mt-1 text-[16px] font-semibold text-white">
            URL do seu webhook + secret (se houver)
          </h2>
        </header>
        <div className="space-y-2">
          <Label className="hud-label">URL pública do webhook destino</Label>
          <Input
            type="url"
            placeholder="https://seu-app.com/webhooks/hotmart"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>
        {hmacInfo && (
          <div className="space-y-2">
            <Label className="hud-label">
              Secret · usado para assinar como{' '}
              <span className="text-cyan-300/80">
                {hmacInfo.header} ({hmacInfo.algorithm})
              </span>
            </Label>
            <Input
              type="password"
              placeholder="Cole o secret/token do seu app"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
            />
          </div>
        )}
      </section>

      {/* Section 3: payload */}
      <section className="glass-card space-y-4 p-6">
        <header>
          <p className="hud-label">3 · Payload</p>
          <h2 className="mt-1 text-[16px] font-semibold text-white">
            Edite headers e body antes de disparar
          </h2>
        </header>
        <div className="space-y-2">
          <Label className="hud-label">Headers (JSON)</Label>
          <textarea
            spellCheck={false}
            className={`${SELECT_CLASS} h-32 resize-y py-3 font-mono text-[12px] leading-5`}
            value={headersText}
            onChange={(e) => setHeadersText(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label className="hud-label">Body (JSON)</Label>
          <textarea
            spellCheck={false}
            className={`${SELECT_CLASS} h-72 resize-y py-3 font-mono text-[12px] leading-5`}
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
          />
        </div>
        <div className="flex justify-end">
          <Button onClick={handleFire} disabled={sending} size="lg">
            <Send className="h-4 w-4" />
            {sending ? 'Disparando…' : 'Disparar webhook'}
          </Button>
        </div>
      </section>

      {/* Section 4: result */}
      {result && (
        <section
          className={`glass-card space-y-4 p-6 ${
            result.ok
              ? 'ring-1 ring-emerald-400/30'
              : 'ring-1 ring-red-400/30'
          }`}
        >
          <header className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {result.ok ? (
                <CheckCircle2 className="h-6 w-6 text-emerald-400" />
              ) : (
                <XCircle className="h-6 w-6 text-red-400" />
              )}
              <div>
                <p className="hud-label">4 · Resultado</p>
                <p className="text-[15px] font-semibold text-white">
                  HTTP {result.status} · {result.duration_ms}ms
                </p>
              </div>
            </div>
          </header>
          {result.error && (
            <div className="rounded-md border border-red-400/30 bg-red-950/20 p-3 text-[12px] text-red-200">
              {result.error}
            </div>
          )}
          {result.response_headers && Object.keys(result.response_headers).length > 0 && (
            <details className="rounded-md border border-white/[0.06] bg-black/20">
              <summary className="cursor-pointer px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">
                Response headers ({Object.keys(result.response_headers).length})
              </summary>
              <pre className="overflow-x-auto px-3 pb-3 font-mono text-[11px] text-white/65">
                {Object.entries(result.response_headers)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join('\n')}
              </pre>
            </details>
          )}
          {result.response_body && result.response_body.length > 0 && (
            <details open className="rounded-md border border-white/[0.06] bg-black/20">
              <summary className="cursor-pointer px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">
                Response body ({result.response_body.length} bytes)
              </summary>
              <pre className="max-h-80 overflow-auto px-3 pb-3 font-mono text-[11px] text-white/75">
                {result.response_body}
              </pre>
            </details>
          )}
          <details className="rounded-md border border-white/[0.06] bg-black/20">
            <summary className="cursor-pointer px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">
              Request enviado
            </summary>
            <pre className="overflow-x-auto px-3 pb-3 font-mono text-[11px] text-white/65">
              {result.sent.method} {result.sent.url}
              {'\n\n'}
              {Object.entries(result.sent.headers)
                .map(([k, v]) => `${k}: ${v}`)
                .join('\n')}
              {'\n\n'}
              {result.sent.body}
            </pre>
          </details>
        </section>
      )}

      {/* Section 5: history */}
      <section className="glass-card space-y-3 p-6">
        <header className="flex items-baseline justify-between">
          <div>
            <p className="hud-label">Histórico</p>
            <h2 className="mt-1 text-[14px] font-semibold text-white">
              Últimas {history.length} chamadas (no seu navegador)
            </h2>
          </div>
          {history.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                clearHistory();
                setHistory([]);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Limpar
            </Button>
          )}
        </header>
        {history.length === 0 ? (
          <p className="text-[12px] text-white/40">Nenhuma chamada registrada ainda.</p>
        ) : (
          <ul className="space-y-1.5">
            {history.map((h) => (
              <li
                key={h.id}
                className="flex items-center justify-between rounded border border-white/[0.05] bg-white/[0.02] px-3 py-1.5 text-[12px]"
              >
                <span className="flex items-center gap-2 truncate">
                  {h.ok ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />
                  )}
                  <span className="truncate font-mono text-white/70">{h.url}</span>
                </span>
                <span className="shrink-0 text-[11px] text-white/45">
                  HTTP {h.status} · {h.durationMs}ms · {new Date(h.at).toLocaleTimeString('pt-BR')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
