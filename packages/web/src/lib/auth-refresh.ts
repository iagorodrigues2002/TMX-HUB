import type { AuthUser } from './api-client/auth-types';

export function authorizationFingerprint(user: AuthUser) {
  return JSON.stringify([user.id, user.role, user.allowedTools?.slice().sort() ?? null]);
}

/** Remote permission edits must reach an already-open tab without resetting valid sessions. */
export function subscribeAuthRefresh(refresh: () => Promise<void>) {
  let running = false;
  let stopped = false;
  const check = () => {
    if (stopped || running || document.visibilityState !== 'visible') return;
    running = true;
    void refresh()
      .catch(() => {}) // The auth provider retains a valid session on a transient request failure.
      .finally(() => {
        running = false;
      });
  };
  const timer = window.setInterval(check, 30_000);
  window.addEventListener('focus', check);
  document.addEventListener('visibilitychange', check);
  return () => {
    stopped = true;
    window.clearInterval(timer);
    window.removeEventListener('focus', check);
    document.removeEventListener('visibilitychange', check);
  };
}
