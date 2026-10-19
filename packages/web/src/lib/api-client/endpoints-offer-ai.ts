import { ApiError } from '../query-client.js';
import type { OfferAiConfigView } from './offer-analysis-types.js';
import type { OfferAiConfigWire } from './offer-analysis-types.js';
import type { OfferAiTone } from './offer-analysis-types.js';
import type { OfferAiAnalysisView } from './offer-analysis-types.js';
import { request } from './request.js';
export const endpoints = {
  async getOfferAiConfig(id: string): Promise<{
    config: OfferAiConfigView;
    models: Array<{ id: string; label: string }>;
    canManage: boolean;
    canCustomize: boolean;
  }> {
    const wire = await request<{
      config: OfferAiConfigWire;
      models: Array<{ id: string; label: string }>;
      can_manage: boolean;
      can_customize: boolean;
    }>(`/v1/offers/${id}/ai-config`);
    return {
      config: {
        provider: wire.config.provider,
        model: wire.config.model,
        role: wire.config.role,
        template: wire.config.template,
        responsible: wire.config.responsible,
        minRoas: wire.config.min_roas,
        tone: wire.config.tone,
        includeAds: wire.config.include_ads,
        autoGenerate: wire.config.auto_generate,
        scheduleHours: wire.config.schedule_hours,
        apiKeyConfigured: wire.config.api_key_configured,
        apiKeyHint: wire.config.api_key_hint,
      },
      models: wire.models,
      canManage: wire.can_manage,
      canCustomize: wire.can_customize,
    };
  },

  async updateOfferAiConfig(
    id: string,
    input: {
      api_key?: string;
      provider: 'opencode-go';
      model: string;
      role: string;
      template: string;
      responsible: string;
      min_roas: number;
      tone: OfferAiTone;
      include_ads: boolean;
      auto_generate: boolean;
      schedule_hours: number[];
    },
  ): Promise<void> {
    await request(`/v1/offers/${id}/ai-config`, { method: 'PUT', body: input });
  },

  async updateOfferAiPreferences(
    id: string,
    input: { model: string; responsible: string },
  ): Promise<void> {
    await request(`/v1/offers/${id}/ai-preferences`, { method: 'PATCH', body: input });
  },

  async generateOfferAiAnalysis(id: string): Promise<OfferAiAnalysisView> {
    await request<{ accepted: true }>(`/v1/offers/${id}/ai-analysis`, { method: 'POST' });

    for (let attempt = 0; attempt < 70; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      const status = await request<{
        status: 'idle' | 'processing' | 'success' | 'error';
        analysisId?: string;
        error?: string;
      }>(`/v1/offers/${id}/ai-analysis-status`);
      if (status.status === 'error') {
        throw new ApiError(status.error || 'Falha ao gerar análise.', 422);
      }
      if (status.status === 'success' && status.analysisId) {
        const analyses = await this.listOfferAiAnalyses(id);
        const analysis = analyses.find((item) => item.id === status.analysisId);
        if (analysis) return analysis;
      }
    }

    throw new ApiError(
      'A análise continua processando. Aguarde alguns instantes e atualize o histórico.',
      408,
    );
  },

  async listOfferAiAnalyses(id: string): Promise<OfferAiAnalysisView[]> {
    const wire = await request<{ analyses: OfferAiAnalysisView[] }>(`/v1/offers/${id}/ai-analyses`);
    return wire.analyses ?? [];
  },

  async updateOfferAiAnalysisFeedback(
    id: string,
    analysisId: string,
    feedback: string,
  ): Promise<OfferAiAnalysisView> {
    return request(`/v1/offers/${id}/ai-analyses/${analysisId}/feedback`, {
      method: 'PATCH',
      body: { feedback },
    });
  },
};
