import type { ToolKey } from '@page-cloner/shared';

export interface CachedAuthUser {
  role: 'admin' | 'user';
  allowedTools?: ToolKey[];
}

interface CacheEntry {
  value: CachedAuthUser;
  expiresAt: number;
}

/** Small process-local LRU for the authorization fields read on every request. */
export class AuthUserCache {
  private readonly entries = new Map<string, CacheEntry>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxSize: number,
  ) {}

  get(userId: string): CachedAuthUser | undefined {
    const entry = this.entries.get(userId);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(userId);
      return undefined;
    }

    // Map preserves insertion order: reinsert on access to promote this key.
    this.entries.delete(userId);
    this.entries.set(userId, entry);
    return cloneValue(entry.value);
  }

  set(userId: string, value: CachedAuthUser): void {
    this.entries.delete(userId);
    while (this.entries.size >= this.maxSize) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
    this.entries.set(userId, {
      value: cloneValue(value),
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  invalidate(userId: string): void {
    this.entries.delete(userId);
  }
}

function cloneValue(value: CachedAuthUser): CachedAuthUser {
  return {
    role: value.role,
    ...(value.allowedTools ? { allowedTools: [...value.allowedTools] } : {}),
  };
}
