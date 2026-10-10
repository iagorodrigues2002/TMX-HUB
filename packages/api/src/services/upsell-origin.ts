export function upsellOrigin(provider: string, connectionName: string | null) {
  const labels: Record<string, string> = { vendepay: 'VendePay', syzepay: 'SyzePay', paysight: 'Paysight', explodely: 'Explodely' };
  return { connection_name: connectionName?.trim() || labels[provider] || provider || 'Gateway não identificado', vendepay_validation_applicable: provider === 'vendepay' };
}
