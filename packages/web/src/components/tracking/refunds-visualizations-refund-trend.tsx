import { refundMoney } from './refunds-visualizations';
import { Empty, type Point } from './refunds-visualizations-support';

export function RefundTrend({
  points,
  isPrivate,
  interval,
}: {
  points: Point[];
  isPrivate: boolean;
  interval: 'day' | 'week' | 'month';
}) {
  if (!points.length) return <Empty />;
  if (isPrivate)
    return (
      <div className="grid min-h-64 place-items-center text-white/60">
        **** · gráfico financeiro oculto pelo modo de privacidade
      </div>
    );
  const w = 900;
  const h = 280;
  const pad = 52;
  const left = 96;
  const max = Math.max(1, ...points.flatMap((p) => [p.brl_minor, p.moving_average_brl_minor]));
  const x = (i: number) => left + ((i + 0.5) * (w - left - pad)) / points.length;
  const y = (v: number) => h - pad - (v / max) * (h - 2 * pad);
  const line = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.moving_average_brl_minor)}`)
    .join(' ');
  return (
    <figure className="mt-6">
      <section
        className="overflow-x-auto rounded-xl border border-white/5 bg-white/[0.015] px-2 pt-4"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: The horizontal chart scroll region must be keyboard-focusable.
        tabIndex={0}
        aria-label="Gráfico de devoluções, dados detalhados disponíveis na tabela abaixo"
      >
        <svg
          role="img"
          aria-label="Devoluções unificadas e média móvel"
          viewBox={`0 0 ${w} ${h}`}
          className="refund-chart-reveal w-full min-w-[520px]"
        >
          <title>Devoluções unificadas e média móvel</title>
          {[0, 0.5, 1].map((fraction) => (
            <g key={fraction}>
              <line
                x1={left}
                x2={w - pad}
                y1={y(max * fraction)}
                y2={y(max * fraction)}
                stroke="currentColor"
                opacity=".09"
                strokeDasharray="4 6"
              />
              <text
                x={left - 12}
                y={y(max * fraction) + 4}
                textAnchor="end"
                fill="var(--text-55)"
                fontSize="11"
              >
                {refundMoney(max * fraction, false)}
              </text>
            </g>
          ))}
          <line
            x1={left}
            x2={w - pad}
            y1={h - pad}
            y2={h - pad}
            stroke="currentColor"
            opacity=".2"
          />
          {points.map((p, i) => (
            <rect
              key={p.date}
              className="refund-bar-reveal"
              style={{ animationDelay: `${Math.min(i * 18, 360)}ms` }}
              x={x(i) - ((w - left - pad) / points.length) * 0.32}
              y={y(p.brl_minor)}
              width={Math.max(1, ((w - left - pad) / points.length) * 0.64)}
              height={Math.max(0, h - pad - y(p.brl_minor))}
              rx="2"
              fill="#fb7185"
            >
              <title>{`${p.date}: ${refundMoney(p.brl_minor, false)} · ${p.count} devoluções`}</title>
            </rect>
          ))}
          <path
            className="refund-chart-reveal"
            d={line}
            fill="none"
            stroke="#67e8f9"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {points
            .filter(
              (_, i) => i === 0 || i === points.length - 1 || i === Math.floor(points.length / 2),
            )
            .map((p) => (
              <text
                key={p.date}
                x={x(points.indexOf(p))}
                y={h - 8}
                textAnchor="middle"
                fill="var(--text-55)"
                fontSize="12"
              >
                {p.date.slice(0, 10).split('-').reverse().join('/')}
              </text>
            ))}
        </svg>
      </section>
      <figcaption className="mt-2 flex flex-wrap gap-4 text-xs text-white/60">
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-sm bg-rose-400" />{' '}
          Reembolsos e chargebacks
        </span>
        <span>
          <span className="text-cyan-200">━</span> Média móvel (
          {interval === 'day' ? '7 dias' : interval === 'week' ? '7 semanas' : '7 meses'})
        </span>
      </figcaption>
      <details className="mt-5 border-t border-white/10 pt-2 text-xs text-white/70">
        <summary className="cursor-pointer rounded-lg py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300">
          Ver valores do gráfico em tabela
        </summary>
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-left tabular-nums [&_th:not(:first-child)]:text-right [&_td:not(:first-child)]:text-right">
            <thead>
              <tr>
                <th className="py-2">Período</th>
                <th>Devoluções</th>
                <th>Valor</th>
                <th>Média móvel</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.date}>
                  <td className="py-2">{p.date.slice(0, 10).split('-').reverse().join('/')}</td>
                  <td>{p.count}</td>
                  <td>{refundMoney(p.brl_minor, false)}</td>
                  <td>{refundMoney(p.moving_average_brl_minor, false)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
