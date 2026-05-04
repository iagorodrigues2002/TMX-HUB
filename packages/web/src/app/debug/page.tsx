'use client';

import { useEffect, useState } from 'react';
import { env } from '@/lib/env';

interface CheckResult {
  name: string;
  url: string;
  status: 'pending' | 'ok' | 'fail';
  http?: number;
  durationMs?: number;
  error?: string;
  body?: string;
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
    const targets = [
      { name: 'GET /healthz', path: '/healthz', method: 'GET' as const },
      { name: 'GET /readyz', path: '/readyz', method: 'GET' as const },
      {
        name: 'OPTIONS /v1/clones (CORS preflight)',
        path: '/v1/clones',
        method: 'OPTIONS' as const,
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
            headers:
              t.method === 'OPTIONS'
                ? {
                    'Access-Control-Request-Method': 'POST',
                    'Access-Control-Request-Headers': 'content-type',
                    Origin: window.location.origin,
                  }
                : undefined,
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
            status: res.ok || (t.method === 'OPTIONS' && res.status === 204) ? 'ok' : 'fail',
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
    <main className="min-h-screen bg-black p-8 font-mono text-sm text-zinc-200">
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-2xl font-bold text-emerald-400">▌ TMX.HUB · DEBUG</h1>

        <section className="rounded border border-zinc-800 bg-zinc-950 p-4">
          <h2 className="mb-3 font-semibold text-emerald-400">Cliente (browser)</h2>
          <dl className="grid grid-cols-[180px_1fr] gap-y-1">
            <dt className="text-zinc-500">Origem da página</dt>
            <dd className="break-all">{origin || '—'}</dd>
            <dt className="text-zinc-500">Protocolo</dt>
            <dd>{protocol || '—'}</dd>
            <dt className="text-zinc-500">navigator.onLine</dt>
            <dd>{online ? 'true' : 'false'}</dd>
            <dt className="text-zinc-500">User agent</dt>
            <dd className="break-all text-xs text-zinc-400">{userAgent || '—'}</dd>
          </dl>
        </section>

        <section className="rounded border border-zinc-800 bg-zinc-950 p-4">
          <h2 className="mb-3 font-semibold text-emerald-400">API (configuração baked)</h2>
          <dl className="grid grid-cols-[180px_1fr] gap-y-1">
            <dt className="text-zinc-500">NEXT_PUBLIC_API_URL</dt>
            <dd className="break-all">{apiUrl}</dd>
            <dt className="text-zinc-500">Protocolo da API</dt>
            <dd>{apiProto}</dd>
            <dt className="text-zinc-500">Mixed content?</dt>
            <dd className={mixedContent ? 'text-red-400' : 'text-emerald-400'}>
              {mixedContent
                ? '⚠ SIM — página HTTPS chamando API HTTP. Browser bloqueia.'
                : 'não'}
            </dd>
          </dl>
        </section>

        <section className="rounded border border-zinc-800 bg-zinc-950 p-4">
          <h2 className="mb-3 font-semibold text-emerald-400">Testes de conectividade</h2>
          <button
            type="button"
            onClick={runChecks}
            className="mb-4 rounded bg-emerald-600 px-3 py-1.5 text-black hover:bg-emerald-500"
          >
            Executar testes
          </button>
          <div className="space-y-3">
            {checks.length === 0 && (
              <p className="text-zinc-500">Clique em &quot;Executar testes&quot; para verificar.</p>
            )}
            {checks.map((c) => (
              <div
                key={c.name}
                className={`rounded border p-3 ${
                  c.status === 'ok'
                    ? 'border-emerald-800 bg-emerald-950/30'
                    : c.status === 'fail'
                      ? 'border-red-800 bg-red-950/30'
                      : 'border-zinc-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{c.name}</span>
                  <span
                    className={
                      c.status === 'ok'
                        ? 'text-emerald-400'
                        : c.status === 'fail'
                          ? 'text-red-400'
                          : 'text-zinc-500'
                    }
                  >
                    {c.status === 'pending'
                      ? '…'
                      : c.status === 'ok'
                        ? `✓ HTTP ${c.http} (${c.durationMs}ms)`
                        : c.http
                          ? `✗ HTTP ${c.http} (${c.durationMs}ms)`
                          : `✗ erro de rede (${c.durationMs}ms)`}
                  </span>
                </div>
                <div className="mt-1 break-all text-xs text-zinc-500">{c.url}</div>
                {c.error && (
                  <div className="mt-2 text-xs text-red-300">
                    <span className="text-zinc-500">erro:</span> {c.error}
                  </div>
                )}
                {c.body && c.body.length > 0 && (
                  <pre className="mt-2 overflow-x-auto rounded bg-black/40 p-2 text-xs text-zinc-400">
                    {c.body}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded border border-zinc-800 bg-zinc-950 p-4 text-xs text-zinc-400">
          <h2 className="mb-2 font-semibold text-emerald-400">Como interpretar</h2>
          <ul className="list-inside list-disc space-y-1">
            <li>
              <strong>Mixed content SIM</strong> → muda <code>NEXT_PUBLIC_API_URL</code> para
              <code> https://</code> e refaz o build do web.
            </li>
            <li>
              <strong>Erro de rede em /healthz</strong> → API não está rodando ou URL está errada.
            </li>
            <li>
              <strong>HTTP 502/503</strong> → API levantou mas crashou (verificar logs do Railway).
            </li>
            <li>
              <strong>OPTIONS falha mas GET ok</strong> → CORS quebrado.
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}
