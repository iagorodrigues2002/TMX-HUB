'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  KeyRound,
  Link2,
  Server,
  Settings as SettingsIcon,
  ShieldCheck,
  Workflow,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiClient, authToken, type OfferView } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { env } from '@/lib/env';
import { cn } from '@/lib/utils';

// Fallback caso a oferta selecionada não tenha dashboardId — usa o do PFL_ENG.
const UTMIFY_DASHBOARD_ID_FALLBACK = '69f3b5692659d80c33debea2';

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0', 'host.docker.internal'];

function isLocalUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return LOCAL_HOSTS.includes(host);
  } catch {
    return false;
  }
}

function decodeJwtExp(token: string | null): Date | null {
  if (!token) return null;
  const parts = token.split('.');
  const payloadPart = parts[1];
  if (parts.length !== 3 || !payloadPart) return null;
  try {
    const payload = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    const json = JSON.parse(atob(padded));
    if (typeof json.exp !== 'number') return null;
    return new Date(json.exp * 1000);
  } catch {
    return null;
  }
}

function maskToken(token: string): string {
  if (token.length <= 24) return token;
  return `${token.slice(0, 12)}…${token.slice(-8)}`;
}

function copy(value: string, label: string) {
  if (!value) {
    toast.error(`Sem valor para copiar (${label}).`);
    return;
  }
  navigator.clipboard.writeText(value).then(
    () => toast.success(`${label} copiado.`),
    () => toast.error(`Não consegui copiar ${label}.`),
  );
}

interface FieldRowProps {
  label: string;
  value: string;
  /** Optional: actual value to copy when display value is masked. Defaults to `value`. */
  copyValue?: string;
  copyLabel?: string;
  mono?: boolean;
  hint?: string;
  warning?: string;
  ok?: string;
}

function FieldRow({
  label,
  value,
  copyValue,
  copyLabel,
  mono,
  hint,
  warning,
  ok,
}: FieldRowProps) {
  const realValue = copyValue ?? value;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="hud-label">{label}</p>
        {hint && <p className="text-[11px] text-white/40">{hint}</p>}
      </div>
      <div className="flex items-center gap-2">
        <div
          className={cn(
            'flex-1 rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13px]',
            mono ? 'font-mono text-white/85' : 'text-white/85',
            'break-all',
          )}
        >
          {value || <span className="italic text-white/40">— vazio —</span>}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => copy(realValue, copyLabel ?? label)}
          disabled={!realValue}
        >
          <Copy className="h-3 w-3" />
          Copiar
        </Button>
      </div>
      {warning && (
        <p className="flex items-start gap-1.5 text-[11px] text-amber-300/90">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{warning}</span>
        </p>
      )}
      {ok && (
        <p className="flex items-start gap-1.5 text-[11px] text-emerald-300/85">
          <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{ok}</span>
        </p>
      )}
    </div>
  );
}

export function SettingsClient() {
  const apiUrl = env.NEXT_PUBLIC_API_URL;
  const apiIsLocal = isLocalUrl(apiUrl);
  const token = authToken.get() ?? '';
  const tokenExp = useMemo(() => decodeJwtExp(token || null), [token]);
  const tokenExpired = tokenExp ? tokenExp.getTime() < Date.now() : false;

  const { data: offers = [], isLoading: offersLoading } = useQuery<OfferView[]>({
    queryKey: ['offers'],
    queryFn: () => apiClient.listOffers(),
  });

  const [selectedOfferId, setSelectedOfferId] = useState<string>('');
  const selectedOffer = offers.find((o) => o.id === selectedOfferId) ?? offers[0];
  const effectiveOfferId = selectedOffer?.id ?? '';
  const utmifyDashboardId =
    selectedOffer?.dashboardId?.trim() || UTMIFY_DASHBOARD_ID_FALLBACK;
  const ingestUrl = effectiveOfferId
    ? `${apiUrl}/v1/offers/${effectiveOfferId}/ingest`
    : '';

  const fullConfigBlock = useMemo(() => {
    return [
      `TMX_API_URL = ${apiUrl}`,
      `TMX_TOKEN = ${token || '<faça login para gerar>'}`,
      `OFFER_ID = ${effectiveOfferId || '<crie uma oferta em /ofertas>'}`,
      `UTMIFY_DASHBOARD_ID = ${utmifyDashboardId}`,
    ].join('\n');
  }, [apiUrl, token, effectiveOfferId, utmifyDashboardId]);

  const everythingReady = !!apiUrl && !!token && !tokenExpired && !!effectiveOfferId;

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <div className="flex items-center gap-2">
          <SettingsIcon className="h-5 w-5 text-cyan-300" />
          <p className="hud-label">Operator Console · Configurações</p>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-white">
          Integração & Credenciais
        </h1>
        <p className="max-w-2xl text-[14px] text-white/55">
          Tudo que você precisa pra plugar o n8n (ou qualquer outro serviço externo) na
          API do TMX HUB. Os valores abaixo são puxados em tempo real do seu ambiente
          atual.
        </p>
      </header>

      {apiIsLocal && (
        <div className="glass-card flex items-start gap-3 border-amber-300/20 bg-amber-300/[0.04] p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
          <div className="space-y-1 text-[13px]">
            <p className="font-semibold text-amber-200">
              Sua API está apontada pra um host local ({apiUrl}).
            </p>
            <p className="text-amber-100/80">
              Se o seu n8n está no Railway (ou em qualquer servidor remoto), ele{' '}
              <strong>não vai conseguir</strong> alcançar essa URL. Opções:
            </p>
            <ul className="list-disc pl-5 text-amber-100/75">
              <li>Deployar a API em um host público (Railway, Render, Fly).</li>
              <li>
                Expor temporariamente com <code className="text-amber-200">ngrok</code> ou
                Cloudflare Tunnel.
              </li>
              <li>
                Rodar o próprio n8n local também e usar{' '}
                <code className="text-amber-200">host.docker.internal:4000</code>.
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* Card 1 — TMX HUB connection */}
      <section className="glass-card space-y-5 p-6">
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-cyan-300" />
          <p className="hud-label">1 · Conexão TMX HUB</p>
        </div>

        <FieldRow
          label="TMX_API_URL"
          value={apiUrl}
          mono
          hint="Lido de NEXT_PUBLIC_API_URL"
          warning={
            apiIsLocal
              ? 'URL local — não acessível do n8n remoto. Veja o aviso acima.'
              : undefined
          }
          ok={!apiIsLocal ? 'URL pública detectada — pronto pra n8n remoto.' : undefined}
        />

        <FieldRow
          label="TMX_TOKEN"
          value={token ? maskToken(token) : ''}
          copyValue={token}
          copyLabel="TMX_TOKEN"
          mono
          hint={
            tokenExp
              ? `Expira em ${tokenExp.toLocaleString('pt-BR')}`
              : 'Token de sessão (JWT)'
          }
          warning={
            !token
              ? 'Você está sem token. Faça login pra gerar.'
              : tokenExpired
                ? 'Token expirado — faça login novamente.'
                : undefined
          }
          ok={
            token && !tokenExpired
              ? 'Sessão válida.'
              : undefined
          }
        />
      </section>

      {/* Card 2 — Offers */}
      <section className="glass-card space-y-5 p-6">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-cyan-300" />
          <p className="hud-label">2 · Oferta de destino</p>
        </div>

        {offersLoading ? (
          <p className="text-[13px] text-white/55">Carregando ofertas…</p>
        ) : offers.length === 0 ? (
          <div className="rounded-md border border-white/[0.08] bg-white/[0.02] p-4 text-[13px] text-white/65">
            Você ainda não tem ofertas. Crie uma em{' '}
            <a href="/ofertas" className="text-cyan-300 hover:text-cyan-200">
              /ofertas
            </a>{' '}
            primeiro.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <p className="hud-label">Selecionar oferta</p>
              <Select
                value={effectiveOfferId}
                onValueChange={(v) => setSelectedOfferId(v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Escolha uma oferta…" />
                </SelectTrigger>
                <SelectContent>
                  {offers.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <FieldRow label="OFFER_ID" value={effectiveOfferId} copyLabel="OFFER_ID" mono />
            <FieldRow
              label="Ingest URL"
              value={ingestUrl}
              copyLabel="Ingest URL"
              mono
              hint="Endpoint que o n8n vai chamar"
            />
          </div>
        )}
      </section>

      {/* Card 3 — n8n integration */}
      <section className="glass-card space-y-5 p-6">
        <div className="flex items-center gap-2">
          <Workflow className="h-4 w-4 text-cyan-300" />
          <p className="hud-label">3 · Integração n8n</p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Button asChild variant="default">
            <a
              href="/tmx-utmify-ingest.n8n.json"
              download="tmx-utmify-ingest.n8n.json"
            >
              <Download className="h-4 w-4" />
              Baixar workflow.json
            </a>
          </Button>

          <Button
            variant="outline"
            onClick={() => copy(fullConfigBlock, 'Bloco de configuração')}
            disabled={!everythingReady}
          >
            <Copy className="h-4 w-4" />
            {everythingReady
              ? 'Copiar todas as 4 variáveis'
              : 'Falta preencher acima'}
          </Button>
        </div>

        <FieldRow
          label="UTMIFY_DASHBOARD_ID"
          value={utmifyDashboardId}
          copyLabel="UTMIFY_DASHBOARD_ID"
          mono
          hint={
            selectedOffer?.dashboardId
              ? `Lido da oferta "${selectedOffer.name}"`
              : 'Fallback — defina por oferta em /ofertas'
          }
        />

        <div className="space-y-2">
          <p className="hud-label">Bloco pronto pra colar no node Config</p>
          <pre className="overflow-x-auto rounded-md border border-white/[0.08] bg-[#04101A]/60 p-4 text-[12px] leading-6 text-white/80">
            <code>{fullConfigBlock}</code>
          </pre>
        </div>

        <div className="rounded-md border border-cyan-300/15 bg-cyan-300/[0.04] p-4 text-[13px] text-white/75">
          <p className="mb-2 flex items-center gap-2 font-semibold text-cyan-200">
            <ShieldCheck className="h-4 w-4" />
            Como aplicar no n8n
          </p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Importe o <code>tmx-utmify-ingest.n8n.json</code> no seu n8n.</li>
            <li>
              Crie a credencial <strong>HTTP Basic Auth</strong> da UTMify (login + senha
              do seu UTMify).
            </li>
            <li>
              Abra o node <strong>⚙️ Config</strong> e crie 4 fields (Add Field) com os
              nomes e valores do bloco acima.
            </li>
            <li>
              Clique em <strong>Execute step</strong> no Config — o output deve mostrar as
              4 variáveis. Depois rode o workflow inteiro pra validar.
            </li>
          </ol>
        </div>
      </section>

      <section className="glass-card flex items-start gap-3 p-5 text-[13px]">
        <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-white/55" />
        <div className="space-y-1 text-white/65">
          <p className="font-medium text-white/85">Sobre o token</p>
          <p>
            O <code>TMX_TOKEN</code> mostrado é o JWT da sua sessão atual no navegador.
            Ele expira — quando expirar, faça login de novo e atualize a variável no n8n.
            Pra produção a longo prazo, considere criar um <em>service token</em> sem
            expiração no backend.
          </p>
        </div>
      </section>
    </div>
  );
}
