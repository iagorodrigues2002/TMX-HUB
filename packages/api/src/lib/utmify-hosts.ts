export const UTMIFY_ALLOWED_HOSTS = [
  'api.utmify.com.br',
  'app.utmify.com.br',
  'utmify.com.br',
  'tracking.utmify.com.br',
] as const;

export function assertUtmifyHost(url: string): void {
  const parsed = new URL(url);
  if (!UTMIFY_ALLOWED_HOSTS.some((host) => host === parsed.hostname)) {
    throw new Error(`UTMify host not allowed: ${parsed.hostname}`);
  }
}
