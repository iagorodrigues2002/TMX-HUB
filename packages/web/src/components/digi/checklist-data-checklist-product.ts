import type { ChecklistSection } from './checklist-data-checklist-section';

export const checklist_product: ChecklistSection = {
  id: 'product',
  emoji: '📦',
  title: 'Cadastro do produto na matriz',
  context: 'Account → Products → New Product. Tudo white-friendly aqui.',
  items: [
    {
      id: 'product-name-white',
      label: 'Nome white-friendly ("Manifestation Mastery System") — SEM claims monetárias',
      critical: true,
    },
    {
      id: 'product-type-digital',
      label: 'Product type: Digital product (download/online course)',
    },
    {
      id: 'description-white',
      label: 'Description pública: 200-400 palavras white, sem promessa de retorno',
      critical: true,
    },
    {
      id: 'price-range',
      label: 'Preço entre $27-$97 (sweet spot prosperidade EUA)',
    },
    {
      id: 'currency-usd',
      label: 'Moeda: USD',
    },
    {
      id: 'language-en',
      label: 'Idioma: English',
    },
    {
      id: 'sales-page-url',
      label: 'Sales Page URL cadastrada (cloakeada — Digi vê white)',
      hasUrl: true,
      critical: true,
    },
    {
      id: 'thank-you-url',
      label: 'Thank-you Page URL cadastrada (cloakeada)',
      hasUrl: true,
      critical: true,
    },
    {
      id: 'support-email',
      label: 'Support email (caixa real, monitorada — refund <6h)',
      critical: true,
    },
    {
      id: 'privacy-url',
      label: 'Privacy Policy URL — WHITE PURO, NUNCA cloakar',
      hasUrl: true,
      critical: true,
    },
    {
      id: 'terms-url',
      label: 'Terms URL — WHITE puro',
      hasUrl: true,
      critical: true,
    },
    {
      id: 'refund-url',
      label: 'Refund Policy URL — WHITE puro, política 30/60d',
      hasUrl: true,
      critical: true,
    },
    {
      id: 'imprint-url',
      label: 'Imprint/Contact — WHITE puro, dados condizentes com cadastro Digi',
      hasUrl: true,
      critical: true,
    },
    {
      id: 'order-form-digi',
      label: 'Order form: Digi-hosted standard (mais seguro no início)',
    },
    {
      id: 'custom-thankyou',
      label: 'Custom Thank-you ativado, redireciona pra /ty',
    },
    {
      id: 'order-bump',
      label: 'Order Bump configurado ($7-$17)',
    },
    {
      id: 'upsell-1',
      label: 'Upsell 1 configurado ($97-$197)',
    },
    {
      id: 'upsell-2',
      label: 'Upsell 2 (Multi-Upsell) configurado ($297)',
    },
    {
      id: 'downsell',
      label: 'Downsell configurado ($47-$67)',
    },
    {
      id: 'no-trigger-words',
      label: 'Order form sem palavras-trigger (guaranteed, make $X, get rich)',
      critical: true,
    },
    {
      id: 'category-spirituality',
      label: 'Categoria: Spirituality / Personal Development (NÃO Money/Business)',
      critical: true,
    },
    {
      id: 'marketplace-off',
      label: 'Marketplace listing OFF inicialmente',
      critical: true,
    },
    {
      id: 'tags-neutral',
      label: 'Tags neutras (mindset, manifestation, personal-growth)',
    },
    {
      id: 'refund-policy-30',
      label: 'Refund: 30-day money-back guarantee (NÃO 60d no início)',
      critical: true,
    },
  ],
};
