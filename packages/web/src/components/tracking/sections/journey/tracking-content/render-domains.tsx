'use client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Copy } from 'lucide-react';
import { Module } from './module';
import type { TrackingContentContext } from './tracking-content-context';
import { trackingDomainPreview } from './tracking-helpers';
export function renderDomains(context: TrackingContentContext) {
  const {
    canManage,
    domainKind,
    setDomainKind,
    domain,
    setDomain,
    addDomain,
    advanced,
    copyDnsValue,
    verifyDomain,
    removeDomain,
  } = context;
  return (
    <Module
      title="Domínios"
      description="Cadastre os domínios que recebem o código. Subdomínios passam a ser identificados pelos eventos."
    >
      {canManage && (
        <div className="grid gap-2 md:grid-cols-[190px_minmax(0,1fr)_auto]">
          <select
            aria-label="Tipo de domínio"
            value={domainKind}
            onChange={(event) => setDomainKind(event.target.value as typeof domainKind)}
            className="h-11 rounded-lg border border-cyan-100/[0.14] bg-[#091a24] px-3 text-sm text-white"
          >
            <option value="source">Domínio do funil</option>
            <option value="tracking">Tracking first-party</option>
          </select>
          <Input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder={domainKind === 'tracking' ? 'suaempresa.com' : 'checkout.suaoferta.com'}
          />
          <Button
            disabled={!domain.trim() || addDomain.isPending}
            onClick={() => addDomain.mutate()}
          >
            Adicionar
          </Button>
        </div>
      )}
      {domainKind === 'tracking' && (
        <div className="mt-3 rounded-xl border border-cyan-300/15 bg-cyan-300/[0.04] p-4 text-xs leading-5 text-white/65">
          <div className="mb-3 rounded-lg border border-emerald-300/15 bg-emerald-300/[0.05] px-3 py-2">
            <span className="text-white/45">Domínio que será criado: </span>
            <code className="font-medium text-emerald-200">
              {trackingDomainPreview(domain) ?? 'tmx.suaempresa.com'}
            </code>
          </div>
          <p className="font-medium text-cyan-100">Configuração no Cloudflare</p>
          <ol className="mt-2 space-y-1.5">
            <li>1. Abra o domínio no Cloudflare e entre em DNS → Registros.</li>
            <li>2. Adicione cada registro exibido abaixo usando os botões de copiar.</li>
            <li>
              3. No CNAME, deixe <strong className="text-white">Proxy desativado</strong> (nuvem
              cinza / Somente DNS) e TTL em Automático.
            </li>
            <li>4. No TXT, use exatamente o Nome e o Conteúdo mostrados, com TTL Automático.</li>
            <li>
              5. Salve, aguarde a propagação e clique em{' '}
              <strong className="text-white">Verificar</strong>.
            </li>
          </ol>
          <p className="mt-2 text-amber-100/70">
            O TMX sempre usará o subdomínio tmx, como tmx.suaempresa.com. Não crie A/AAAA para ele e
            não altere o DNS da landing page ou do checkout.
          </p>
        </div>
      )}
      <div className="mt-4 space-y-2">
        {advanced.data?.domains?.map((item) => (
          <div
            key={item.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.07] p-3 text-sm"
          >
            <div className="min-w-0">
              <p className="truncate text-white/80">{item.hostname}</p>
              <p className="mt-1 text-xs text-white/45">
                {item.status === 'live'
                  ? 'O TMX recebeu eventos deste domínio.'
                  : item.last_error || 'Instale o script e abra a página para confirmar.'}
              </p>
              {item.kind === 'tracking' && item.dns_target && (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] uppercase tracking-wider text-white/35">
                      Registros para criar
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        const records = item.dns_records?.length
                          ? item.dns_records
                          : [{ hostlabel: item.hostname, requiredValue: item.dns_target! }];
                        void copyDnsValue(
                          records
                            .map((record) => {
                              const type = record.requiredValue.includes('verify')
                                ? 'TXT'
                                : 'CNAME';
                              return `${type}\t${record.hostlabel}\t${record.requiredValue}`;
                            })
                            .join('\n'),
                          'Configuração completa',
                        );
                      }}
                      className="flex items-center gap-1.5 rounded px-2 py-1 text-[10px] text-cyan-200/65 transition hover:bg-white/[0.05] hover:text-cyan-200"
                    >
                      <Copy className="h-3.5 w-3.5" /> Copiar tudo
                    </button>
                  </div>
                  {(item.dns_records?.length
                    ? item.dns_records
                    : [{ hostlabel: item.hostname, requiredValue: item.dns_target }]
                  ).map((record) => {
                    const type = record.requiredValue.includes('verify') ? 'TXT' : 'CNAME';
                    return (
                      <div
                        key={`${record.hostlabel}-${record.requiredValue}`}
                        className="rounded-lg border border-white/[0.07] bg-black/15 p-3"
                      >
                        <div className="grid gap-2 lg:grid-cols-[90px_minmax(0,1fr)_minmax(0,1.4fr)]">
                          {[
                            { label: 'Tipo', value: type },
                            { label: 'Nome', value: record.hostlabel },
                            {
                              label: type === 'TXT' ? 'Conteúdo' : 'Destino',
                              value: record.requiredValue,
                            },
                          ].map((field) => (
                            <div key={field.label} className="min-w-0">
                              <p className="font-mono text-[9px] uppercase tracking-wider text-white/35">
                                {field.label}
                              </p>
                              <div className="mt-1 flex items-center gap-1">
                                <code className="min-w-0 flex-1 break-all font-mono text-[11px] text-cyan-100/75">
                                  {field.value}
                                </code>
                                <button
                                  type="button"
                                  aria-label={`Copiar ${field.label}`}
                                  onClick={() => void copyDnsValue(field.value, field.label)}
                                  className="rounded p-1.5 text-white/35 transition hover:bg-white/[0.06] hover:text-cyan-200"
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                        {type === 'CNAME' && (
                          <p className="mt-2 text-[10px] text-amber-100/60">
                            Cloudflare: Proxy desativado (Somente DNS) · TTL Automático
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className={item.status === 'live' ? 'text-emerald-300' : 'text-amber-300'}>
                {item.status === 'live'
                  ? 'ao vivo'
                  : item.status === 'dns_verified'
                    ? 'DNS confirmado'
                    : item.kind === 'tracking'
                      ? 'aguardando DNS'
                      : 'aguardando evento'}
              </span>
              {canManage && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={verifyDomain.isPending}
                    onClick={() => verifyDomain.mutate(item.id)}
                  >
                    Verificar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={removeDomain.isPending}
                    onClick={() => {
                      if (
                        window.confirm(`Remover ${item.hostname} desta configuração de tracking?`)
                      )
                        removeDomain.mutate(item.id);
                    }}
                  >
                    Remover
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}
        {!advanced.data?.domains?.length && (
          <p className="rounded-xl border border-dashed border-white/[0.1] p-4 text-sm text-white/50">
            Nenhum domínio cadastrado. Adicione o domínio sem protocolo ou caminho, por exemplo{' '}
            <code className="text-cyan-200">checkout.suaempresa.com</code>.
          </p>
        )}
      </div>
    </Module>
  );
}
