'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { type AuthUser, apiClient, authToken } from './api-client';
import { setPersonalStorageOwner } from './personal-storage';
import { ApiError } from './query-client';
import { resetSessionData } from './session-data';

interface AuthState {
  user: AuthUser | null;
  /** True while we're checking the existing token at boot. */
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, name: string, password: string, inviteToken?: string) => Promise<void>;
  logout: () => void;
  /** Force a refresh of the user from /auth/me. */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const client = useQueryClient();
  const revision = useRef(0);
  const principal = useRef<string | null>(null);
  const [sessionEpoch, setSessionEpoch] = useState(0);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const resetSession = useCallback(() => {
    revision.current += 1;
    principal.current = null;
    resetSessionData(client);
    setUser(null);
    setSessionEpoch((epoch) => epoch + 1);
  }, [client]);

  const refresh = useCallback(async () => {
    const currentRevision = revision.current;
    if (!authToken.get()) {
      resetSession();
      setLoading(false);
      return;
    }
    try {
      const u = await apiClient.me();
      if (currentRevision !== revision.current) return;
      const identity = `${u.id}:${u.role}`;
      // An administrator downgraded in another session must not retain the
      // global cache when /me refreshes their role.
      if (principal.current && principal.current !== identity) resetSession();
      principal.current = identity;
      setPersonalStorageOwner(u.id);
      setUser(u);
      setLoading(false);
    } catch (error) {
      // Clear credentials only when the API explicitly rejects them. Mobile
      // network transitions and temporary outages must not destroy a valid
      // session and turn a recoverable request into a login loop.
      if (currentRevision !== revision.current) return;
      if (error instanceof ApiError && error.status === 401) {
        authToken.clear();
        resetSession();
        setLoading(false);
      }
    } finally {
      if (currentRevision === revision.current) setLoading(false);
    }
  }, [resetSession]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const syncSession = (event: StorageEvent) => {
      if (event.key !== 'tmx-hub:auth-token' && event.key !== null) return;
      resetSession();
      setLoading(true);
      if (event.newValue && event.key !== null) authToken.set(event.newValue);
      else authToken.clear();
      void refresh();
    };
    window.addEventListener('storage', syncSession);
    return () => window.removeEventListener('storage', syncSession);
  }, [refresh, resetSession]);

  const login = useCallback(
    async (email: string, password: string) => {
      const currentRevision = revision.current;
      const { user: u, token } = await apiClient.login(email, password);
      if (currentRevision !== revision.current) return;
      resetSession();
      authToken.set(token);
      principal.current = `${u.id}:${u.role}`;
      setPersonalStorageOwner(u.id);
      setUser(u);
      setLoading(false);
    },
    [resetSession],
  );

  const register = useCallback(
    async (email: string, name: string, password: string, inviteToken?: string) => {
      const currentRevision = revision.current;
      const { user: u, token } = await apiClient.register(email, name, password, inviteToken);
      if (currentRevision !== revision.current) return;
      resetSession();
      authToken.set(token);
      principal.current = `${u.id}:${u.role}`;
      setPersonalStorageOwner(u.id);
      setUser(u);
      setLoading(false);
    },
    [resetSession],
  );

  const logout = useCallback(() => {
    authToken.clear();
    resetSession();
    setLoading(false);
    router.push('/login');
  }, [router, resetSession]);

  const value = useMemo<AuthState>(
    () => ({ user, loading, login, register, logout, refresh }),
    [user, loading, login, register, logout, refresh],
  );

  return (
    <AuthContext.Provider key={sessionEpoch} value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
