import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setUnauthorizedHandler } from './api.js';
import { setCurrency } from './format.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [settings, setSettings] = useState(null);
  const [ready, setReady] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      const s = await api.get('/settings');
      setSettings(s);
      setCurrency(s.currency);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setSession(null));
    api.get('/auth/me')
      .then(async (s) => { setSession(s); await loadSettings(); })
      .catch(() => setSession(null))
      .finally(() => setReady(true));
  }, [loadSettings]);

  const login = useCallback(async (email, password) => {
    const s = await api.post('/auth/login', { email, password });
    setSession(s);
    await loadSettings();
    return s;
  }, [loadSettings]);

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout'); } finally { setSession(null); }
  }, []);

  const value = useMemo(() => ({
    ready,
    user: session?.user,
    role: session?.role,
    roleLabel: session?.roleLabel,
    permissions: session?.permissions || {},
    can: (module, level = 'r') => {
      const g = session?.permissions?.[module];
      if (!g) return false;
      return level === 'r' || g === 'rw';
    },
    settings,
    reloadSettings: loadSettings,
    login,
    logout,
  }), [ready, session, settings, login, logout, loadSettings]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
