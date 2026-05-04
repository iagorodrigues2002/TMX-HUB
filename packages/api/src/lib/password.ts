import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEYLEN = 64;
const SALT_BYTES = 16;

/**
 * Hash a password with scrypt. Output format: `scrypt$<saltHex>$<hashHex>`.
 * Self-describing so we can swap algorithms later without a DB migration.
 */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await scrypt(plain, salt, KEYLEN);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

/**
 * Constant-time verify. Returns false on any malformed stored value.
 */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1] ?? '', 'hex');
  const expected = Buffer.from(parts[2] ?? '', 'hex');
  if (salt.length === 0 || expected.length === 0) return false;
  const key = await scrypt(plain, salt, expected.length);
  if (key.length !== expected.length) return false;
  return timingSafeEqual(key, expected);
}
