/** Red flags shown as a permanent reference sidebar — these are NOT checklist items, they're alerts. */
export const RED_FLAGS: Array<{ id: string; label: string }> = [
  {
    id: 'rf-compliance-email',
    label: 'Email da Digi com "compliance", "review", "manual review", "verification"',
  },
  { id: 'rf-cb-1pct', label: 'CB rate >1% em 7 dias rolling' },
  { id: 'rf-refund-12pct', label: 'Refund rate >12%' },
  { id: 'rf-screenshare', label: 'Account Manager pede screenshare ou auditoria' },
  {
    id: 'rf-dispute-keyword',
    label: 'Cliente abre dispute mencionando palavra-chave do funil black',
  },
  { id: 'rf-cloakup-leak', label: 'CloakUp loga IP da Digistore caindo em BLACK' },
  { id: 'rf-stripe-question', label: 'Stripe/banco do Digi pede informações sobre o produto' },
];
