'use client';

import type { OfferView } from '@/lib/api-client';

export function syncLabel(offer: OfferView): string {
  if (offer.syncStatus === 'syncing') return 'Sincronizando agora…';
  if (offer.syncStatus === 'partial') {
    return `Parcial: ${offer.lastSyncError ?? 'alguns dias falharam'}`;
  }
  if (offer.syncStatus === 'error') return `Erro: ${offer.lastSyncError ?? 'verifique a conexão'}`;
  if (offer.lastSyncAt) return `Atualizado ${new Date(offer.lastSyncAt).toLocaleString('pt-BR')}`;
  return offer.utmifyConfigured ? 'Aguardando primeira sincronização' : 'UTMify não conectada';
}
