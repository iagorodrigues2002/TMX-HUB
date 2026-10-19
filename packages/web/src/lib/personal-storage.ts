// Browser persistence is personal, not shared between accounts using one device.
// Never migrate legacy unscoped records: their owner cannot be established.
let ownerId: string | null = null;

export function getPersonalStorageOwner(): string | null {
  return ownerId;
}

export function setPersonalStorageOwner(id: string | null): void {
  ownerId = id;
}

function personalKey(key: string): string | null {
  return ownerId ? `${key}:user:${encodeURIComponent(ownerId)}` : null;
}

export function readPersonalStorage(key: string): string | null {
  const scoped = personalKey(key);
  if (!scoped || typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(scoped);
  } catch {
    return null;
  }
}

export function writePersonalStorage(key: string, value: string | null): void {
  const scoped = personalKey(key);
  if (!scoped || typeof window === 'undefined') return;
  try {
    if (value === null) window.localStorage.removeItem(scoped);
    else window.localStorage.setItem(scoped, value);
  } catch {
    /* Private-mode or storage quota must not expose a different owner. */
  }
}
