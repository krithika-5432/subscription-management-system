import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { get, post, tokenStore } from '../services/api';
import type { User } from '../types';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string, remember: boolean) => Promise<User>;
  loginWithGoogle: (credential: string, remember: boolean) => Promise<User>;
  register: (input: unknown) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  /** For showing or hiding UI only. The API enforces every permission itself. */
  can: (...permissions: string[]) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setUser(await get<User>('/auth/me'));
  }, []);

  useEffect(() => {
    if (!tokenStore.get()) {
      setLoading(false);
      return;
    }
    refresh()
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, [refresh]);

  const startSession = useCallback(async (token: string, remember: boolean) => {
    tokenStore.set(token, remember);
    const me = await get<User>('/auth/me');
    setUser(me);
    return me;
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      refresh,
      login: async (email, password, remember) => {
        const { token } = await post<{ token: string }>('/auth/login', { email, password, remember });
        return startSession(token, remember);
      },
      loginWithGoogle: async (credential, remember) => {
        const { token } = await post<{ token: string }>('/auth/google', { credential, remember });
        return startSession(token, remember);
      },
      register: async (input) => {
        const { token } = await post<{ token: string }>('/auth/register', input);
        return startSession(token, false);
      },
      logout: async () => {
        await post('/auth/logout').catch(() => undefined);
        tokenStore.clear();
        setUser(null);
      },
      can: (...permissions) => !!user && (user.role === 'admin' || permissions.some((p) => user.permissions.includes(p))),
    }),
    [user, loading, refresh, startSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export const homeFor = (user: User) => (user.role === 'customer' ? '/portal/dashboard' : '/app/dashboard');
