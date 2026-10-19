'use client';

import { type OfferAiTone, apiClient } from '@/lib/api-client';
import { copyText } from '@/lib/clipboard';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useState } from 'react';
import { toast } from 'sonner';

export function useOfferAiAnalysisState({ offerId }: { offerId: string }) {
  const id = useId();
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

  const preferencesMutation = useMutation({
    mutationFn: () =>
      apiClient.updateOfferAiPreferences(offerId, {
        model,
        responsible: responsible.trim(),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['offer-ai-config', offerId] });
      toast.success('Suas preferências de análise foram salvas.');
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
    if (!(await copyText(latest.text, 'Análise copiada.'))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1_500);
  };
  return {
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
  };
}
