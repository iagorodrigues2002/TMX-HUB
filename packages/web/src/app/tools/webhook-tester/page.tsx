import { Webhook } from 'lucide-react';
import { HubShell } from '@/components/hub/hub-shell';
import { WebhookTester } from '@/components/webhook/webhook-tester';

export default function WebhookTesterPage() {
  return (
    <HubShell breadcrumb={['TOOLS', 'WEBHOOK TESTER']}>
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 space-y-3 text-center">
          <div
            className="mx-auto grid h-14 w-14 place-items-center rounded-md border border-cyan-300/30"
            style={{
              background:
                'linear-gradient(135deg, rgba(20,184,166,0.18), rgba(34,211,238,0.05))',
            }}
          >
            <Webhook className="h-6 w-6 text-cyan-300" />
          </div>
          <p className="hud-label">Module 004 — Webhook Tester</p>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Simule webhooks de qualquer checkout
          </h1>
          <p className="mx-auto max-w-2xl text-[14px] text-white/55">
            Templates prontos pra Hotmart, Kiwify, Eduzz, Monetizze, Braip, Ticto, Cakto,
            Perfect Pay e Stripe. Edita o payload, dispara para sua URL e vê a resposta —
            sem precisar fazer venda real.
          </p>
        </header>

        <WebhookTester />

        <p className="mt-8 text-center text-[10px] uppercase tracking-[0.18em] text-white/30">
          v0.8 ACTIVE · CHAMADA SERVER-SIDE (sem CORS) · HMAC GERADO NO BROWSER
        </p>
      </div>
    </HubShell>
  );
}
