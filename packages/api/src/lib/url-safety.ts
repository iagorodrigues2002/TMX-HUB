import { promises as dns } from 'node:dns';
import { BadRequestError } from './problem.js';

const BLOCKED_HOSTNAMES = new Set(['localhost', '0.0.0.0', '::1']);

function isIPv4Literal(hostname: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
}

function isIPv6Literal(hostname: string): boolean {
  return hostname.includes(':');
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return false;
  const [a, b] = parts as [number, number, number, number];
  if (a === 127) return true; // 127.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 (metadata)
  if (a === 0) return true; // 0.0.0.0/8
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1') return true; // loopback
  if (/^f[cd]/i.test(lower)) return true; // fc00::/7 (ULA)
  if (lower === '::' || lower === '0:0:0:0:0:0:0:0') return true; // unspecified
  // IPv4-mapped ::ffff:x.x.x.x
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]!);
  return false;
}

function assertNotPrivateIP(addr: string): void {
  if (isPrivateIPv4(addr) || isPrivateIPv6(addr)) {
    throw new BadRequestError('Requests to private or reserved IP ranges are not allowed.');
  }
}

/**
 * Validates that a URL is safe for outbound HTTP requests.
 * Blocks private/reserved IPs, non-http(s) schemes, and DNS rebinding.
 */
export async function assertSafeOutboundUrl(raw: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new BadRequestError('Invalid URL format.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new BadRequestError(
      `URL scheme "${parsed.protocol}" is not allowed. Only http and https are accepted.`,
    );
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new BadRequestError(`Requests to "${hostname}" are not allowed.`);
  }

  // If hostname is already a numeric IP, check it directly — no DNS needed.
  if (isIPv4Literal(hostname)) {
    assertNotPrivateIP(hostname);
    return;
  }

  if (isIPv6Literal(hostname)) {
    assertNotPrivateIP(hostname);
    return;
  }

  // DNS resolution — check every A and AAAA record (DNS rebinding protection).
  const [v4Result, v6Result] = await Promise.allSettled([
    dns.resolve4(hostname),
    dns.resolve6(hostname),
  ]);

  const addresses: string[] = [];
  if (v4Result.status === 'fulfilled') addresses.push(...v4Result.value);
  if (v6Result.status === 'fulfilled') addresses.push(...v6Result.value);

  if (addresses.length === 0) {
    throw new BadRequestError(`URL hostname "${hostname}" could not be resolved.`);
  }

  for (const addr of addresses) {
    assertNotPrivateIP(addr);
  }
}
