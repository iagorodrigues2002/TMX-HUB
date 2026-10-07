'use client';

import { AccountSecurity } from '@/components/settings/account-security';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { type OfferView, apiClient, authToken } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { env } from '@/lib/env';
import {
  SHOW_SETTINGS_N8N_INTEGRATION,
  SHOW_SETTINGS_OFFER_DESTINATION,
  SHOW_SETTINGS_TMX_CONNECTION,
} from '@/lib/ui-visibility';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  KeyRound,
  Link2,
  Server,
  ShieldCheck,
  Workflow,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

const UTMIFY_DASHBOARD_ID_FALLBACK = '69f3b5692659d80c33debea2';
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0', 'host.docker.internal'];
const SHOW_ANY_INTEGRATION =
  SHOW_SETTINGS_TMX_CONNECTION || SHOW_SETTINGS_OFFER_DESTINATION || SHOW_SETTINGS_N8N_INTEGRATION;

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
  copyValue?: string;
  copyLabel?: string;
  mono?: boolean;
  hint?: string;
  warning?: string;
  ok?: string;
}

function FieldRow({ label, value, copyValue, copyLabel, mono, hint, warning, ok }: FieldRowProps) {
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
          <Copy className="h-3 w-3" aria-hidden />
          Copiar
        </Button>
      </div>
      {warning && (
        <p className="flex items-start gap-1.5 text-[11px] text-amber-300/90">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          <span>{warning}</span>
        </p>
      )}
      {ok && (
        <p className="flex items-start gap-1.5 text-[11px] text-emerald-300/85">
          <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          <span>{ok}</span>
        </p>
      )}
    </div>
  );
}

function SettingsIntegrations({ isAdmin }: { isAdmin: boolean }) {
  const apiUrl = env.NEXT_PUBLIC_API_URL;
  const apiIsLocal = isLocalUrl(apiUrl);
  const token = authToken.get() ?? '';
  const tokenExp = useMemo(() => decodeJwtExp(token || null), [token]);
  const tokenExpired = tokenExp ? tokenExp.getTime() < Date.now() : false;
  const needsOffers = SHOW_SETTINGS_OFFER_DESTINATION || SHOW_SETTINGS_N8N_INTEGRATION;

  const { data: offers = [], isLoading: offersLoading } = useQuery<OfferView[]>({
    queryKey: ['offers'],
    queryFn: () => apiClient.listOffers(),
    enabled: isAdmin && needsOffers,
  });

  const [selectedOfferId, setSelectedOfferId] = useState('');
  const selectedOffer = offers.find((offer) => offer.id === selectedOfferId) ?? offers[0];
  const effectiveOfferId = selectedOffer?.id ?? '';
  const utmifyDashboardId = selectedOffer?.dashboardId?.trim() || UTMIFY_DASHBOARD_ID_FALLBACK;
  const ingestUrl = effectiveOfferId ? `${apiUrl}/v1/offers/${effectiveOfferId}/ingest` : '';
  const fullConfigBlock = useMemo(
    () =>
      [
        `TMX_API_URL = ${apiUrl}`,
        `TMX_TOKEN = ${token || '<faça login para gerar>'}`,
        `OFFER_ID = ${effectiveOfferId || '<crie uma oferta em /ofertas>'}`,
        `UTMIFY_DASHBOARD_ID = ${utmifyDashboardId}`,
      ].join('\n'),
    [apiUrl, token, effectiveOfferId, utmifyDashboardId],
  );
  const everythingReady = !!apiUrl && !!token && !tokenExpired && !!effectiveOfferId;

  return (
    <>
      {SHOW_SETTINGS_TMX_CONNECTION && apiIsLocal && (
        <div className="glass-card flex items-start gap-3 border-amber-300/20 bg-amber-300/[0.04] p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden />
          <div className="space-y-1 text-[13px]">
            <p className="font-semibold text-amber-200">
              Sua API está apontada pra um host local ({apiUrl}).
            </p>
            <p className="text-amber-100/80">
              Serviços remotos não conseguem acessar essa URL. Use um host público ou um túnel
              temporário antes de configurar a integração.
            </p>
          </div>
        </div>
      )}

      {SHOW_SETTINGS_TMX_CONNECTION && (
        <section className="glass-card space-y-5 p-6">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-cyan-300" aria-hidden />
            <h2 className="hud-label">Conexão TMX HUB</h2>
          </div>
          <FieldRow
            label="TMX_API_URL"
            value={apiUrl}
            mono
            hint="Lido de NEXT_PUBLIC_API_URL"
            warning={apiIsLocal ? 'URL local — não acessível por serviços remotos.' : undefined}
            ok={!apiIsLocal ? 'URL pública detectada.' : undefined}
          />
          <FieldRow
            label="TMX_TOKEN"
            value={token ? maskToken(token) : ''}
            copyValue={token}
            copyLabel="TMX_TOKEN"
            mono
            hint={tokenExp ? `Expira em ${tokenExp.toLocaleString('pt-BR')}` : 'Token de sessão'}
            warning={
              !token
                ? 'Faça login para gerar um token.'
                : tokenExpired
                  ? 'Token expirado — faça login novamente.'
                  : undefined
            }
            ok={token && !tokenExpired ? 'Sessão válida.' : undefined}
          />
        </section>
      )}

      {SHOW_SETTINGS_OFFER_DESTINATION && (
        <section className="glass-card space-y-5 p-6">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-cyan-300" aria-hidden />
            <h2 className="hud-label">Oferta de destino</h2>
          </div>
          {offersLoading ? (
            <p className="text-[13px] text-white/55">Carregando ofertas…</p>
          ) : offers.length === 0 ? (
            <p className="rounded-md border border-white/[0.08] bg-white/[0.02] p-4 text-[13px] text-white/65">
              Crie uma oferta antes de configurar este destino.
            </p>
          ) : (
            <div className="space-y-4">
              <Select value={effectiveOfferId} onValueChange={setSelectedOfferId}>
                <SelectTrigger aria-label="Selecionar oferta">
                  <SelectValue placeholder="Escolha uma oferta…" />
                </SelectTrigger>
                <SelectContent>
                  {offers.map((offer) => (
                    <SelectItem key={offer.id} value={offer.id}>
                      {offer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldRow label="OFFER_ID" value={effectiveOfferId} copyLabel="OFFER_ID" mono />
              <FieldRow label="Ingest URL" value={ingestUrl} copyLabel="Ingest URL" mono />
            </div>
          )}
        </section>
      )}

      {SHOW_SETTINGS_N8N_INTEGRATION && (
        <section className="glass-card space-y-5 p-6">
          <div className="flex items-center gap-2">
            <Workflow className="h-4 w-4 text-cyan-300" aria-hidden />
            <h2 className="hud-label">Integração n8n</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Button asChild>
              <a href="/tmx-utmify-ingest.n8n.json" download="tmx-utmify-ingest.n8n.json">
                <Download className="h-4 w-4" aria-hidden />
                Baixar workflow.json
              </a>
            </Button>
            <Button
              variant="outline"
              onClick={() => copy(fullConfigBlock, 'Bloco de configuração')}
              disabled={!everythingReady}
            >
              <Copy className="h-4 w-4" aria-hidden />
              {everythingReady ? 'Copiar configuração' : 'Falta preencher acima'}
            </Button>
          </div>
          <FieldRow
            label="UTMIFY_DASHBOARD_ID"
            value={utmifyDashboardId}
            copyLabel="UTMIFY_DASHBOARD_ID"
            mono
          />
          <pre className="overflow-x-auto rounded-md border border-white/[0.08] bg-[#04101A]/60 p-4 text-[12px] leading-6 text-white/80">
            <code>{fullConfigBlock}</code>
          </pre>
          <p className="flex items-center gap-2 text-[13px] text-white/65">
            <ShieldCheck className="h-4 w-4 text-cyan-300" aria-hidden />
            Importe o arquivo e preencha o node de configuração com os valores acima.
          </p>
        </section>
      )}

      {(SHOW_SETTINGS_TMX_CONNECTION || SHOW_SETTINGS_N8N_INTEGRATION) && (
        <section className="glass-card flex items-start gap-3 p-5 text-[13px]">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-white/55" aria-hidden />
          <div className="space-y-1 text-white/65">
            <p className="font-medium text-white/85">Sobre o token</p>
            <p>O token mostrado é o JWT da sessão atual e precisa ser renovado após expirar.</p>
          </div>
        </section>
      )}
    </>
  );
}

export function SettingsClient() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (!loading && user && !isAdmin) router.replace('/tools');
  }, [isAdmin, loading, router, user]);

  if (loading || !isAdmin) return null;

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="page-title">Conta e segurança</h1>
        <p className="page-description">
          Atualize sua senha e mantenha o acesso à sua conta protegido.
        </p>
      </header>

      <AccountSecurity />

      {SHOW_ANY_INTEGRATION && <SettingsIntegrations isAdmin={isAdmin} />}
    </div>
  );
}
