/**
 * Browser-side HMAC using Web Crypto. Returns the lowercase hex digest.
 * Used to sign webhook payloads with the user-supplied secret before sending.
 */
export async function hmacHex(
  algorithm: 'sha256' | 'sha1',
  secret: string,
  body: string,
): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: algorithm === 'sha256' ? 'SHA-256' : 'SHA-1' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
