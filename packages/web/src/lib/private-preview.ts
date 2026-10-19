import { ApiError } from './query-client';

function escapeAttribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}

export async function loadPrivatePreview(
  url: string,
  token: string | null,
  signal: AbortSignal,
): Promise<string> {
  if (!token) throw new ApiError('Entre para visualizar este clone.', 401);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'text/html' },
    cache: 'no-store',
    signal,
  });
  if (!response.ok) throw new ApiError('Não foi possível visualizar este clone.', response.status);
  const html = await response.text();
  // srcDoc does not inherit response headers. Preserve the endpoint's policy
  // and disallow scripts even if an upstream proxy ever removes that header.
  const policy =
    response.headers.get('content-security-policy') ||
    "default-src 'none'; img-src https: data:; style-src 'unsafe-inline' https:; font-src https: data:; script-src 'none'; form-action 'none'";
  return `<!doctype html><meta http-equiv="Content-Security-Policy" content="${escapeAttribute(policy)}"><meta name="referrer" content="no-referrer">${html}`;
}
