export const creativeLocalPreview = process.env.NEXT_PUBLIC_TMX_LOCAL_PREVIEW_KIND === 'synthetic';
export const creativeWorkspaceEnabled =
  creativeLocalPreview || process.env.NEXT_PUBLIC_TMX_CREATIVE_DRIVE_ENABLED === '1';
export const creativeDrivePath = creativeLocalPreview
  ? '/api/creative-drive'
  : '/v1/ads-intelligence/creative-drive';
