'use client';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiClient, type OfferAiTone } from '@/lib/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Check, Clipboard, Loader2, Save, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

export function OfferAiAnalysis({ offerId }: { offerId: string }) {
  const qc = useQueryClient();
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [role, setRole] = useState('');
  const [template, setTemplate] = useState('');
  const [responsible, setResponsible] = useState('');
  const [minRoas, setMinRoas] = useState('0');
  const [tone, setTone] = useState<OfferAiTone>('direto');
  const [includeAds, setIncludeAds] = useState(true);
  const [autoGenerate, setAutoGenerate] = useState(false);
  const [scheduleHours, setScheduleHours] = useState<number[]>([]);
  const [copied, setCopied] = useState(false);
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, string>>({});

  const configQuery = useQuery({
    queryKey: ['offer-ai-config', offerId],
    queryFn: () => apiClient.getOfferAiConfig(offerId),
  });
  const historyQuery = useQuery({
    queryKey: ['offer-ai-analyses', offerId],
    queryFn: () => apiClient.listOfferAiAnalyses(offerId),
  });

  useEffect(() => {
    const config = configQuery.data?.config;
    if (!config) return;
    setModel(config.model);
    setRole(config.role);
    setTemplate(config.template);
    setResponsible(config.responsible);
    setMinRoas(String(config.minRoas));
    setTone(config.tone);
    setIncludeAds(config.includeAds);
    setAutoGenerate(config.autoGenerate);
    setScheduleHours(config.scheduleHours);
  }, [configQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      apiClient.updateOfferAiConfig(offerId, {
        ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
        provider: 'opencode-go',
        model,
        role,
        template,
        responsible: responsible.trim(),
        min_roas: Number(minRoas) || 0,
        tone,
        include_ads: includeAds,
        auto_generate: autoGenerate,
        schedule_hours: scheduleHours,
      }),
    onSuccess: () => {
      setApiKey('');
      void qc.invalidateQueries({ queryKey: ['offer-ai-config', offerId] });
      toast.success('Configuração da IA salva com segurança.');
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const generateMutation = useMutation({
    mutationFn: () => apiClient.generateOfferAiAnalysis(offerId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['offer-ai-analyses', offerId] });
      toast.success('Análise de campanha gerada.');
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const feedbackMutation = useMutation({
    mutationFn: ({ analysisId, feedback }: { analysisId: string; feedback: string }) =>
      apiClient.updateOfferAiAnalysisFeedback(offerId, analysisId, feedback),
    onSuccess: (analysis) => {
      setFeedbackDrafts((current) => ({ ...current, [analysis.id]: analysis.feedback ?? '' }));
      void qc.invalidateQueries({ queryKey: ['offer-ai-analyses', offerId] });
      toast.success('Feedback salvo. Ele será usado nas próximas análises.');
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const latest = generateMutation.data ?? historyQuery.data?.[0];
  const canGenerate = Boolean(configQuery.data?.config.apiKeyConfigured);
  const canSave =
    model.trim() &&
    role.trim().length >= 20 &&
    template.trim().length >= 50 &&
    (apiKey.trim().length >= 8 || configQuery.data?.config.apiKeyConfigured);

  const copy = async () => {
    if (!latest) return;
    await navigator.clipboard.writeText(latest.text);
    setCopied(true);
    toast.success('Análise copiada.');
    setTimeout(() => setCopied(false), 1_500);
  };

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

      {configQuery.data?.canManage && (
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
                    configQuery.data.config.apiKeyHint
                      ? `Configurada: ${configQuery.data.config.apiKeyHint}`
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
                    {configQuery.data.models.map((item) => (
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
              <label className="flex items-center gap-3 self-end rounded-md border border-white/[0.07] px-3 py-2.5 text-[12px] text-white/65">
                <Checkbox
                  checked={includeAds}
                  onChange={() => setIncludeAds((current) => !current)}
                />
                Incluir dados por anúncio na análise
              </label>
            </div>

            <section className="space-y-3 rounded-md border border-white/[0.07] bg-black/10 p-4">
              <label className="flex items-center gap-3 text-[12px] text-white/70">
                <Checkbox
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
              Variáveis disponíveis: {'{{offer_name}}'}, {'{{date}}'}, {'{{time}}'},{' '}
              {'{{responsible}}'}, {'{{currency}}'}, {'{{min_roas}}'}, {'{{spend}}'},{' '}
              {'{{revenue}}'}, {'{{sales}}'}, {'{{roas}}'}, {'{{cpa}}'}, {'{{ic}}'},{' '}
              {'{{windows_json}}'} e {'{{ads_json}}'}.
            </p>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!canSave || saveMutation.isPending}
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Salvar configuração
            </Button>
          </div>
        </details>
      )}

      <div className="space-y-4 p-5">
        {latest ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <p className="hud-label">Última análise</p>
              <Button variant="outline" size="sm" onClick={copy}>
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
                          onClick={() => {
                            void navigator.clipboard.writeText(analysis.text);
                            toast.success('Análise copiada.');
                          }}
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

function AnalysisFeedback({
  analysisId,
  value,
  pending,
  onChange,
  onSave,
}: {
  analysisId: string;
  value: string;
  pending: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <div className="mt-3 rounded-md border border-cyan-300/10 bg-cyan-300/[0.025] p-3">
      <Label htmlFor={`ai-feedback-${analysisId}`} className="text-[11px] text-cyan-100/70">
        Resultado depois desta análise
      </Label>
      <textarea
        id={`ai-feedback-${analysisId}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={1_000}
        rows={3}
        className={`${textareaClass} mt-2`}
        placeholder="Ex.: reduzi o orçamento às 16h; a janela seguinte recuperou para ROAS 1,8."
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-[10px] text-white/30">
          A próxima análise usará este resultado como memória operacional.
        </p>
        <Button variant="outline" size="sm" onClick={onSave} disabled={pending}>
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          Salvar feedback
        </Button>
      </div>
    </div>
  );
}

const textareaClass =
  'w-full rounded-md border border-white/10 bg-[#0b1b22] px-3 py-2 text-[12px] leading-5 text-white outline-none placeholder:text-white/25 focus:border-cyan-300/35';
const SCHEDULE_HOURS = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22];

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
