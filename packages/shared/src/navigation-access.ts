/** Explicit navigation selection is opt-in; existing tool grants keep their legacy behavior. */
export const NAVIGATION_IDS = [
  'overview',
  'offers-all',
  'offer-detail',
  'ads-intelligence',
  'traffic-overview',
  'traffic-campaigns',
  'traffic-windows',
  'traffic-contingency',
  'traffic-settings',
  'tracking-overview',
  'tracking-journey',
  'tracking-upsell-intelligence',
  'tracking-capture',
  'tracking-diagnostics',
  'company-members',
  'task-management',
  'company-finance',
  'refunds',
  'operator-activity',
  'tools-catalog',
  'tool-page-cloner',
  'tool-vsl',
  'tool-upsell',
  'tool-webhook',
  'tool-funnel-clone',
  'tool-video-studio',
  'integration-payments',
  'integration-syzepay',
  'integration-meta',
  'integration-utmify',
  'integration-google',
  'integration-tiktok',
  'integration-vturb',
  'integration-pushcut',
] as const;
export type NavigationId = (typeof NAVIGATION_IDS)[number];
export type NavigationKey = `nav:${NavigationId}` | 'nav:scoped';
export const NAVIGATION_KEYS: NavigationKey[] = [
  'nav:scoped',
  ...NAVIGATION_IDS.map((id) => `nav:${id}` as NavigationKey),
];
export function hasNavigationAccess(tools: readonly string[] | undefined, id: string) {
  return !tools?.includes('nav:scoped') || tools.includes(`nav:${id}`);
}
