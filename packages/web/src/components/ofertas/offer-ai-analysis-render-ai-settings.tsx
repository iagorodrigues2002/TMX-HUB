'use client';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { OfferAiTone } from '@/lib/api-client';
import { Loader2, Save } from 'lucide-react';
import { Field, SCHEDULE_HOURS, textareaClass } from './offer-ai-analysis-support';
import type { useOfferAiAnalysisState } from './offer-ai-analysis-use-offer-ai-analysis-state';

export function renderAiSettings({
  aiConfig,
  id,
  apiKey,
  setApiKey,
  model,
  setModel,
  role,
  setRole,
  template,
  setTemplate,
  responsible,
  setResponsible,
  minRoas,
  setMinRoas,
  tone,
  setTone,
  includeAds,
  setIncludeAds,
  autoGenerate,
  setAutoGenerate,
  scheduleHours,
  setScheduleHours,
  configQuery,
  saveMutation,
  canSave,
}: Pick<
  ReturnType<typeof useOfferAiAnalysisState>,
  | 'id'
  | 'apiKey'
  | 'setApiKey'
  | 'model'
  | 'setModel'
  | 'role'
  | 'setRole'
  | 'template'
  | 'setTemplate'
  | 'responsible'
  | 'setResponsible'
  | 'minRoas'
  | 'setMinRoas'
  | 'tone'
  | 'setTone'
  | 'includeAds'
  | 'setIncludeAds'
  | 'autoGenerate'
  | 'setAutoGenerate'
  | 'scheduleHours'
  | 'setScheduleHours'
  | 'configQuery'
  | 'saveMutation'
  | 'canSave'
> & { aiConfig: NonNullable<ReturnType<typeof useOfferAiAnalysisState>['configQuery']['data']> }) {
  return (
    <details className="border-b border-white/[0.06]">
      <summary className="cursor-pointer px-5 py-4 text-[12px] font-semibold text-cyan-100">
        Configurar OpenCode Go, modelo e instruções
      </summary>
      <div className="space-y-5 border-t border-white/[0.05] px-5 py-5">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Chave API do OpenCode Go" htmlFor="ai-api-key">
            <Input
              id="ai-api-key"
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={
                aiConfig.config.apiKeyHint
                  ? `Configurada: ${aiConfig.config.apiKeyHint}`
                  : 'Cole a chave para salvar criptografada'
              }
              autoComplete="new-password"
            />
          </Field>
          <Field label="Modelo de IA" htmlFor="ai-model">
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger id="ai-model">
                <SelectValue placeholder="Selecione o modelo" />
              </SelectTrigger>
              <SelectContent>
                {aiConfig.models.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Responsável" htmlFor="ai-responsible">
            <Input
              id="ai-responsible"
              value={responsible}
              onChange={(event) => setResponsible(event.target.value)}
              placeholder="Iago Rodrigues"
            />
          </Field>
          <Field label="ROAS mínimo" htmlFor="ai-min-roas">
            <Input
              id="ai-min-roas"
              type="number"
              min="0"
              step="0.01"
              value={minRoas}
              onChange={(event) => setMinRoas(event.target.value)}
            />
          </Field>
          <Field label="Tom da análise" htmlFor="ai-tone">
            <Select value={tone} onValueChange={(value) => setTone(value as OfferAiTone)}>
              <SelectTrigger id="ai-tone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="direto">Direto</SelectItem>
                <SelectItem value="conservador">Conservador</SelectItem>
                <SelectItem value="detalhado">Detalhado</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <label
            htmlFor={`${id}-include-ads`}
            className="flex items-center gap-3 self-end rounded-md border border-white/[0.07] px-3 py-2.5 text-[12px] text-white/65"
          >
            <Checkbox
              id={`${id}-include-ads`}
              checked={includeAds}
              onChange={() => setIncludeAds((current) => !current)}
            />
            Incluir dados por anúncio na análise
          </label>
        </div>

        <section className="space-y-3 rounded-md border border-white/[0.07] bg-black/10 p-4">
          <label
            htmlFor={`${id}-auto-generate`}
            className="flex items-center gap-3 text-[12px] text-white/70"
          >
            <Checkbox
              id={`${id}-auto-generate`}
              checked={autoGenerate}
              onChange={() => setAutoGenerate((current) => !current)}
            />
            Gerar análises automaticamente após a sincronização
          </label>
          {autoGenerate && (
            <div>
              <p className="mb-2 text-[10px] uppercase tracking-[0.13em] text-white/40">
                Horários de geração · América/São Paulo
              </p>
              <div className="flex flex-wrap gap-2">
                {SCHEDULE_HOURS.map((hour) => {
                  const selected = scheduleHours.includes(hour);
                  return (
                    <button
                      key={hour}
                      type="button"
                      onClick={() =>
                        setScheduleHours((current) =>
                          selected
                            ? current.filter((item) => item !== hour)
                            : [...current, hour].sort((a, b) => a - b),
                        )
                      }
                      className={`rounded-md border px-3 py-2 font-mono text-[11px] transition ${
                        selected
                          ? 'border-cyan-300/35 bg-cyan-300/10 text-cyan-100'
                          : 'border-white/[0.07] text-white/40 hover:text-white/70'
                      }`}
                    >
                      {String(hour).padStart(2, '0')}:00
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[10px] text-white/35">
                O sistema gera no máximo uma análise em cada horário selecionado.
              </p>
            </div>
          )}
        </section>

        <Field label="Função da IA" htmlFor="ai-role">
          <textarea
            id="ai-role"
            value={role}
            onChange={(event) => setRole(event.target.value)}
            rows={5}
            className={textareaClass}
          />
        </Field>
        <Field label="Template detalhado e editável" htmlFor="ai-template">
          <textarea
            id="ai-template"
            value={template}
            onChange={(event) => setTemplate(event.target.value)}
            rows={18}
            className={`${textareaClass} font-mono text-[11px]`}
          />
        </Field>
        <p className="text-[10px] text-white/35">
          Variáveis disponíveis: {'{{offer_name}}'}, {'{{date}}'}, {'{{time}}'}, {'{{responsible}}'}
          , {'{{currency}}'}, {'{{min_roas}}'}, {'{{spend}}'}, {'{{revenue}}'}, {'{{sales}}'},{' '}
          {'{{roas}}'}, {'{{cpa}}'}, {'{{ic}}'}, {'{{windows_json}}'}, {'{{ads_json}}'} e{' '}
          {'{{funnels_json}}'}.
        </p>
        <Button onClick={() => saveMutation.mutate()} disabled={!canSave || saveMutation.isPending}>
          {saveMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Salvar configuração
        </Button>
      </div>
    </details>
  );
}
