import { CheckCircle2, CircleDashed } from 'lucide-react';

interface CaptureParameter {
  name: string;
  description: string;
  occurrences: number;
}

interface CaptureNetwork {
  id: string;
  name: string;
  description: string;
  parameters: readonly CaptureParameter[];
}

const CAPTURE_NETWORKS: readonly CaptureNetwork[] = [
  {
    id: 'tiktok',
    name: 'TikTok Ads',
    description: 'Identificadores preservados entre o clique no anúncio e a conversão.',
    parameters: [
      {
        name: 'ttclid',
        description: 'Click ID captado pela URL ou pelo cookie _ttclid.',
        occurrences: 0,
      },
      {
        name: 'ttp',
        description: 'Identificador do navegador armazenado no cookie _ttp do pixel.',
        occurrences: 0,
      },
      {
        name: 'utm_source=tiktok',
        description: 'Origem padrão esperada para reconhecer campanhas do TikTok.',
        occurrences: 0,
      },
    ],
  },
  {
    id: 'google',
    name: 'Google Ads',
    description: 'Sinais de clique web e iOS preservados para atribuição da conversão.',
    parameters: [
      {
        name: 'gclid',
        description: 'Click ID usado em cliques normais na web.',
        occurrences: 0,
      },
      {
        name: 'wbraid',
        description: 'Identificador de clique para campanhas iOS Web-to-App.',
        occurrences: 0,
      },
      {
        name: 'gbraid',
        description: 'Identificador alternativo para campanhas iOS Web-to-App.',
        occurrences: 0,
      },
      {
        name: 'gcl_*',
        description: 'Cookies legados do Google Ads preservados quando disponíveis.',
        occurrences: 0,
      },
      {
        name: 'utm_source=google',
        description: 'Origem padrão esperada para reconhecer campanhas do Google.',
        occurrences: 0,
      },
    ],
  },
];

function formatOccurrences(value: number) {
  return `${value.toLocaleString('pt-BR')} ${value === 1 ? 'ocorrência' : 'ocorrências'}`;
}

export function NetworkCaptureParameters() {
  return (
    <section aria-labelledby="capture-network-parameters-title" className="space-y-3">
      <div>
        <h2 id="capture-network-parameters-title" className="text-sm font-semibold text-white/85">
          Parâmetros capturados por rede
        </h2>
        <p className="mt-1 text-xs leading-5 text-white/45">
          A contagem será preenchida quando o TMX identificar cada sinal nas próximas visitas.
        </p>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        {CAPTURE_NETWORKS.map((network) => (
          <article
            key={network.id}
            aria-labelledby={`${network.id}-capture-title`}
            className="overflow-hidden rounded-lg border border-cyan-300/15 bg-cyan-300/[0.035]"
          >
            <div className="border-b border-white/[0.07] px-4 py-3">
              <h3
                id={`${network.id}-capture-title`}
                className="text-sm font-semibold text-white/85"
              >
                {network.name}
              </h3>
              <p className="mt-1 text-xs leading-5 text-white/45">{network.description}</p>
            </div>

            <ul
              className="divide-y divide-white/[0.06]"
              aria-label={`Parâmetros de ${network.name}`}
            >
              {network.parameters.map((parameter) => {
                const captured = parameter.occurrences > 0;

                return (
                  <li
                    key={parameter.name}
                    className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <code className="text-xs font-semibold text-cyan-100">{parameter.name}</code>
                      <p className="mt-1 text-xs leading-5 text-white/45">
                        {parameter.description}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
                      <span className="font-mono text-xs tabular-nums text-white/55">
                        {formatOccurrences(parameter.occurrences)}
                      </span>
                      <span
                        className={
                          captured
                            ? 'inline-flex min-h-7 items-center gap-1.5 rounded-full border border-emerald-300/20 bg-emerald-300/[0.06] px-2.5 py-1 text-[11px] font-medium text-emerald-200'
                            : 'inline-flex min-h-7 items-center gap-1.5 rounded-full border border-white/[0.09] bg-white/[0.035] px-2.5 py-1 text-[11px] font-medium text-white/45'
                        }
                      >
                        {captured ? (
                          <CheckCircle2 aria-hidden className="h-3.5 w-3.5" />
                        ) : (
                          <CircleDashed aria-hidden className="h-3.5 w-3.5" />
                        )}
                        {captured ? 'Capturado' : 'Não capturado'}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
