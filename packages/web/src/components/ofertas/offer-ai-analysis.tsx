'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { copyText } from '@/lib/clipboard';
import { Bot, Check, Clipboard, Loader2, Save, Sparkles } from 'lucide-react';
import { renderAiSettings } from './offer-ai-analysis-render-ai-settings';
import { AnalysisFeedback, Field } from './offer-ai-analysis-support';
import { useOfferAiAnalysisState } from './offer-ai-analysis-use-offer-ai-analysis-state';

export function OfferAiAnalysis({ offerId }: { offerId: string }) {
  const {
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
    copied,
    feedbackDrafts,
    setFeedbackDrafts,
    configQuery,
    historyQuery,
    saveMutation,
    generateMutation,
    preferencesMutation,
    feedbackMutation,
    latest,
    canGenerate,
    canSave,
    copy,
  } = useOfferAiAnalysisState({ offerId });

  return (
    <section className="glass-card overflow-hidden">
      <header className="flex flex-wrap items-center gap-3 border-b border-white/[0.06] px-5 py-4">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-300/10 text-violet-200">
          <Bot className="h-5 w-5" />
        </span>
        <div className="mr-auto">
          <h2 className="text-[16px] font-semibold text-white">Análise de janelas com IA</h2>
          <p className="mt-1 text-[11px] text-white/40">
            Números calculados pelo TMX HUB; a IA escreve somente a leitura operacional.
          </p>
        </div>
        <Button
          onClick={() => generateMutation.mutate()}
          disabled={!canGenerate || generateMutation.isPending}
        >
          {generateMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          Gerar análise
        </Button>
      </header>

      {!canGenerate && !configQuery.data?.canManage && (
        <p className="m-5 rounded-md border border-amber-300/15 bg-amber-300/[0.04] p-3 text-[12px] text-amber-100/70">
          O administrador ainda não configurou a IA para esta oferta.
        </p>
      )}

      {configQuery.data?.canManage &&
        renderAiSettings({
          aiConfig: configQuery.data,
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
        })}

      {configQuery.data?.canCustomize && !configQuery.data.canManage && (
        <details className="border-b border-white/[0.06]">
          <summary className="cursor-pointer px-5 py-4 text-[12px] font-semibold text-cyan-100">
            Suas preferências de análise
          </summary>
          <div className="grid gap-4 border-t border-white/[0.05] px-5 py-5 md:grid-cols-2">
            <Field label="Seu nome no relatório" htmlFor="member-ai-responsible">
              <Input
                id="member-ai-responsible"
                value={responsible}
                onChange={(event) => setResponsible(event.target.value)}
                placeholder="Digite seu nome"
                maxLength={100}
              />
            </Field>
            <Field label="Modelo de IA" htmlFor="member-ai-model">
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger id="member-ai-model">
                  <SelectValue placeholder="Selecione o modelo" />
                </SelectTrigger>
                <SelectContent>
                  {configQuery.data.models.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="md:col-span-2">
              <p className="mb-3 text-[10px] text-white/35">
                A chave API é administrada com segurança pelo responsável do hub e não fica
                disponível para membros.
              </p>
              <Button
                onClick={() => preferencesMutation.mutate()}
                disabled={!model || !responsible.trim() || preferencesMutation.isPending}
              >
                {preferencesMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Salvar minhas preferências
              </Button>
            </div>
          </div>
        </details>
      )}

      <div className="space-y-4 p-5">
        {latest ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <p className="hud-label">Última análise</p>
              <Button variant="outline" size="sm" onClick={() => void copy()}>
                {copied ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
                Copiar
              </Button>
            </div>
            <pre className="whitespace-pre-wrap rounded-lg border border-violet-300/10 bg-black/20 p-4 font-sans text-[13px] leading-6 text-white/75">
              {latest.text}
            </pre>
            <p className="text-[10px] text-white/30">
              {new Date(latest.createdAt).toLocaleString('pt-BR')} · {latest.model}
            </p>
            {configQuery.data?.canManage && (
              <AnalysisFeedback
                analysisId={latest.id}
                value={feedbackDrafts[latest.id] ?? latest.feedback ?? ''}
                pending={feedbackMutation.isPending}
                onChange={(value) =>
                  setFeedbackDrafts((current) => ({ ...current, [latest.id]: value }))
                }
                onSave={() =>
                  feedbackMutation.mutate({
                    analysisId: latest.id,
                    feedback: feedbackDrafts[latest.id] ?? latest.feedback ?? '',
                  })
                }
              />
            )}
            {(historyQuery.data?.length ?? 0) > 1 && (
              <details className="rounded-md border border-white/[0.06]">
                <summary className="cursor-pointer px-4 py-3 text-[11px] font-semibold text-white/55">
                  Histórico de análises ({historyQuery.data?.length})
                </summary>
                <div className="space-y-3 border-t border-white/[0.05] p-3">
                  {historyQuery.data?.slice(1, 10).map((analysis) => (
                    <div
                      key={analysis.id}
                      className="rounded-md border border-white/[0.05] bg-black/10 p-3"
                    >
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="text-[10px] text-white/35">
                          {new Date(analysis.createdAt).toLocaleString('pt-BR')} · {analysis.model}
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void copyText(analysis.text, 'Análise copiada.')}
                        >
                          <Clipboard className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <pre className="line-clamp-6 whitespace-pre-wrap font-sans text-[11px] leading-5 text-white/55">
                        {analysis.text}
                      </pre>
                      {configQuery.data?.canManage && (
                        <AnalysisFeedback
                          analysisId={analysis.id}
                          value={feedbackDrafts[analysis.id] ?? analysis.feedback ?? ''}
                          pending={feedbackMutation.isPending}
                          onChange={(value) =>
                            setFeedbackDrafts((current) => ({
                              ...current,
                              [analysis.id]: value,
                            }))
                          }
                          onSave={() =>
                            feedbackMutation.mutate({
                              analysisId: analysis.id,
                              feedback: feedbackDrafts[analysis.id] ?? analysis.feedback ?? '',
                            })
                          }
                        />
                      )}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </>
        ) : (
          <p className="py-6 text-center text-[12px] text-white/35">
            Configure a IA e gere a primeira análise desta oferta.
          </p>
        )}
      </div>
    </section>
  );
}
