'use client';

import { useRouter } from 'next/navigation';
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { type AuthUser, apiClient, authToken } from './api-client';

interface AuthState {
  user: AuthUser | null;
  /** True while we're checking the existing token at boot. */
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    name: string,
    password: string,
    inviteToken?: string,
  ) => Promise<void>;
  logout: () => void;
  /** Force a refresh of the user from /auth/me. */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!authToken.get()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const u = await apiClient.me();
      setUser(u);
    } catch {
      // Token is bad → clear it.
      authToken.clear();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      const { user: u, token } = await apiClient.login(email, password);
      authToken.set(token);
      setUser(u);
    },
    [],
  );

  const register = useCallback(
    async (email: string, name: string, password: string, inviteToken?: string) => {
      const { user: u, token } = await apiClient.register(
        email,
        name,
        password,
        inviteToken,
      );
      authToken.set(token);
      setUser(u);
    },
    [],
  );

  const logout = useCallback(() => {
    authToken.clear();
    setUser(null);
    router.push('/login');
  }, [router]);

  const value = useMemo<AuthState>(
    () => ({ user, loading, login, register, logout, refresh }),
    [user, loading, login, register, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
