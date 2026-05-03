import { ulid } from 'ulid';

const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export function newJobId(): string {
  return ulid();
}

export function newFormId(): string {
  return `frm_${ulid()}`;
}

export function newLinkId(): string {
  return `lnk_${ulid()}`;
}

export function newBuildId(): string {
  return `bld_${ulid()}`;
}

export function isValidUlid(value: string): boolean {
  return ULID_REGEX.test(value);
}

export function isValidPrefixedUlid(value: string, prefix: 'frm' | 'lnk' | 'bld'): boolean {
  return new RegExp(`^${prefix}_[0-9A-HJKMNP-TV-Z]{26}$`).test(value);
}
