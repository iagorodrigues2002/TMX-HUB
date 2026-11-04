'use client';

import { PublicSurface } from '@/components/hub/public-surface';

import { env } from '@/lib/env';
import { useEffect, useState } from 'react';

interface CheckResult {
  name: string;
  url: string;
  status: 'pending' | 'ok' | 'warning' | 'fail';
  http?: number;
  durationMs?: number;
  error?: string;
  body?: string;
}

interface CheckTarget {
  name: string;
  path: string;
  method: 'GET';
  headers?: Record<string, string>;
}

export default function DebugPage() {
  const [origin, setOrigin] = useState<string>('');
  const [protocol, setProtocol] = useState<string>('');
  const [online, setOnline] = useState<boolean>(true);
  const [userAgent, setUserAgent] = useState<string>('');
  const [checks, setChecks] = useState<CheckResult[]>([]);

  useEffect(() => {
    setOrigin(window.location.origin);
    setProtocol(window.location.protocol);
    setOnline(navigator.onLine);
    setUserAgent(navigator.userAgent);
  }, []);

  const apiUrl = env.NEXT_PUBLIC_API_URL;
  let apiProto = 'unknown:';
  try {
    apiProto = new URL(apiUrl).protocol;
  } catch {
    apiProto = 'invalid';
  }
  const mixedContent = protocol === 'https:' && apiProto === 'http:';

  async function runChecks() {
    const targets: CheckTarget[] = [
      { name: 'GET /healthz', path: '/healthz', method: 'GET' as const },
      { name: 'GET /readyz', path: '/readyz', method: 'GET' as const },
      {
        name: 'CORS preflight (GET /healthz + Authorization)',
        path: '/healthz',
        method: 'GET',
        // Authorization is safe to set in fetch and makes the browser issue the
        // OPTIONS preflight itself. Origin and Access-Control-Request-* are forbidden.
        headers: { Authorization: 'Bearer debug-cors-preflight' },
      },
    ];

    const initial: CheckResult[] = targets.map((t) => ({
      name: t.name,
      url: `${apiUrl}${t.path}`,
      status: 'pending',
    }));
    setChecks(initial);

    const results = await Promise.all(
      targets.map(async (t): Promise<CheckResult> => {
        const url = `${apiUrl}${t.path}`;
        const t0 = performance.now();
        try {
          const res = await fetch(url, {
            method: t.method,
            cache: 'no-store',
            headers: t.headers,
          });
          const dur = Math.round(performance.now() - t0);
          let body = '';
          try {
            body = (await res.text()).slice(0, 500);
          } catch {
            // ignore
          }
          return {
            name: t.name,
            url,
            status:
              t.path === '/readyz' && res.status === 503
                ? 'warning'
                : res.status === 200
                  ? 'ok'
                  : 'fail',
            http: res.status,
            durationMs: dur,
            body,
          };
        } catch (err) {
          const dur = Math.round(performance.now() - t0);
          return {
            name: t.name,
            url,
            status: 'fail',
            durationMs: dur,
            error: (err as Error).message,
          };
        }
      }),
    );
    setChecks(results);
  }

  return (
    <PublicSurface>
      <main className="min-h-screen bg-background p-8 font-mono text-sm text-muted-foreground">
        <div className="mx-auto max-w-3xl space-y-6">
          <h1 className="text-2xl font-bold text-success">▌ TMX HUB · DEBUG</h1>

          <section className="rounded border border-border bg-background p-4">
            <h2 className="mb-3 font-semibold text-success">Cliente (browser)</h2>
            <dl className="grid grid-cols-[180px_1fr] gap-y-1">
              <dt className="text-muted-foreground">Origem da página</dt>
              <dd className="break-all">{origin || '—'}</dd>
              <dt className="text-muted-foreground">Protocolo</dt>
              <dd>{protocol || '—'}</dd>
              <dt className="text-muted-foreground">navigator.onLine</dt>
              <dd>{online ? 'true' : 'false'}</dd>
              <dt className="text-muted-foreground">User agent</dt>
              <dd className="break-all text-xs text-muted-foreground">{userAgent || '—'}</dd>
            </dl>
          </section>

          <section className="rounded border border-border bg-background p-4">
            <h2 className="mb-3 font-semibold text-success">API (configuração baked)</h2>
            <dl className="grid grid-cols-[180px_1fr] gap-y-1">
              <dt className="text-muted-foreground">NEXT_PUBLIC_API_URL</dt>
              <dd className="break-all">{apiUrl}</dd>
              <dt className="text-muted-foreground">Protocolo da API</dt>
              <dd>{apiProto}</dd>
              <dt className="text-muted-foreground">Mixed content?</dt>
              <dd className={mixedContent ? 'text-danger' : 'text-success'}>
                {mixedContent ? '! SIM — página HTTPS chamando API HTTP. Browser bloqueia.' : 'não'}
              </dd>
            </dl>
          </section>

          <section className="rounded border border-border bg-background p-4">
            <h2 className="mb-3 font-semibold text-success">Testes de conectividade</h2>
            <button
              type="button"
              onClick={() => void runChecks()}
              className="mb-4 rounded bg-success/10 px-3 py-1.5 text-foreground hover:bg-success/10"
            >
              Executar testes
            </button>
            <div className="space-y-3">
              {checks.length === 0 && (
                <p className="text-muted-foreground">
                  Clique em &quot;Executar testes&quot; para verificar.
                </p>
              )}
              {checks.map((c) => (
                <div
                  key={c.name}
                  className={`rounded border p-3 ${
                    c.status === 'ok'
                      ? 'border-success/30 bg-success/10'
                      : c.status === 'warning'
                        ? 'border-warning/30 bg-warning/10'
                        : c.status === 'fail'
                          ? 'border-danger/30 bg-danger/10'
                          : 'border-border'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{c.name}</span>
                    <span
                      className={
                        c.status === 'ok'
                          ? 'text-success'
                          : c.status === 'warning'
                            ? 'text-warning'
                            : c.status === 'fail'
                              ? 'text-danger'
                              : 'text-muted-foreground'
                      }
                    >
                      {c.status === 'pending'
                        ? '…'
                        : c.status === 'ok'
                          ? `✓ HTTP ${c.http} (${c.durationMs}ms)`
                          : c.status === 'warning'
                            ? `! HTTP ${c.http} (${c.durationMs}ms) — MinIO/Chromium indisponível; esperado em dev`
                            : c.http
                              ? `✗ HTTP ${c.http} (${c.durationMs}ms)`
                              : `✗ erro de rede (${c.durationMs}ms)`}
                    </span>
                  </div>
                  <div className="mt-1 break-all text-xs text-muted-foreground">{c.url}</div>
                  {c.error && (
                    <div className="mt-2 text-xs text-danger">
                      <span className="text-muted-foreground">erro:</span> {c.error}
                    </div>
                  )}
                  {c.body && c.body.length > 0 && (
                    <pre className="mt-2 overflow-x-auto rounded bg-accent p-2 text-xs text-muted-foreground">
                      {c.body}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="rounded border border-border bg-background p-4 text-xs text-muted-foreground">
            <h2 className="mb-2 font-semibold text-success">Como interpretar</h2>
            <ul className="list-inside list-disc space-y-1">
              <li>
                <strong>Mixed content SIM</strong> → muda <code>NEXT_PUBLIC_API_URL</code> para
                <code> https://</code> e refaz o build do web.
              </li>
              <li>
                <strong>Erro de rede em /healthz</strong> → API não está rodando ou URL está errada.
              </li>
              <li>
                <strong>/readyz HTTP 503</strong> → dependências opcionais como MinIO ou Chromium
                podem estar paradas em dev; trate como warning.
              </li>
              <li>
                <strong>CORS preflight falha mas /healthz passa</strong> → configuração de CORS
                bloqueou o header Authorization.
              </li>
            </ul>
          </section>
        </div>
      </main>
    </PublicSurface>
  );
}
