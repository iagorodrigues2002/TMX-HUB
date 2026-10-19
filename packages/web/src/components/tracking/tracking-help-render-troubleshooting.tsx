'use client';

import { AlertTriangle } from 'lucide-react';
import { Result, Section } from './tracking-help-support';

export function renderTroubleshooting() {
  return (
    <Section
      id="diagnostico"
      number="08"
      title="Status, quarentena e troubleshooting"
      subtitle="Use o estado recebido e o diagnóstico do webhook para encontrar o ponto exato da falha."
      icon={<AlertTriangle className="h-5 w-5" />}
    >
      <div className="grid gap-3 md:grid-cols-2">
        <Result title="Pago" detail="Pagamento confirmado. Conta como venda aprovada." />
        <Result
          title="Pendente"
          detail="Pedido criado, mas o pagamento ainda não foi confirmado."
        />
        <Result
          title="Recusado ou cancelado"
          detail="A transação existe, porém não deve entrar no faturamento."
          tone="warn"
        />
        <Result
          title="Reembolso ou chargeback"
          detail="A venda foi revertida. Esse estado tem prioridade e não volta para pendente."
          tone="warn"
        />
        <Result
          title="Sem atribuição"
          detail="A venda chegou, mas sem src válido. Revise o link do CTA e a propagação do identificador."
          tone="warn"
        />
        <Result
          title="Quarentena"
          detail="O webhook chegou, mas faltam dados essenciais ou o formato não foi reconhecido. Consulte o motivo e preserve o payload para ajuste."
          tone="warn"
        />
      </div>

      <div className="mt-6 overflow-hidden rounded-md border border-white/[0.07]">
        {[
          [
            'Nenhum PageView',
            'Confirme o script no HTML final, a chave pública, bloqueadores e erros no console do navegador.',
          ],
          [
            'Sem src no checkout',
            'O CTA deve ser um link clicável. Confirme se outro script substitui a URL depois do clique.',
          ],
          [
            'Webhook 401',
            'A URL foi copiada incompleta ou o token não corresponde à oferta. Gere uma nova configuração se o segredo vazou.',
          ],
          [
            'Webhook em quarentena',
            'Abra os diagnósticos. Normalmente falta ID da transação ou o payload da Vendepay mudou.',
          ],
          [
            'Venda duplicada',
            'Não altere o ID da transação. Retries normais atualizam o mesmo pedido de forma idempotente.',
          ],
          [
            'Tracking indisponível',
            'Consulte o diagnóstico automático na área de tracking. Não é necessário acessar o Railway.',
          ],
          [
            'Purchase não aparece no Meta',
            'Confira Pixel ID, token, Test Event Code e a entrega Meta no painel. Falhas temporárias são reenviadas automaticamente.',
          ],
        ].map(([problem, action], index) => (
          <div
            key={problem}
            className={`grid gap-1 p-4 md:grid-cols-[180px_1fr] md:gap-5 ${
              index ? 'border-t border-white/[0.06]' : ''
            }`}
          >
            <p className="text-xs font-medium text-white/75">{problem}</p>
            <p className="text-xs leading-5 text-white/40">{action}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
