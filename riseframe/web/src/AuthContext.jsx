import React, { createContext, useContext, useEffect, useState } from 'react';
import { getToken, setToken, fetchMe, login as apiLogin, register as apiRegister } from './api.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false); // sessão já checada?

  // Restaura a sessão (se houver token salvo) na abertura.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!getToken()) {
        setReady(true);
        return;
      }
      try {
        const me = await fetchMe();
        if (!cancelled) setUser(me);
      } catch {
        setToken(''); // token inválido/expirado
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function login(email, password) {
    const { token, user: u } = await apiLogin(email, password);
    setToken(token);
    setUser(u);
    return u;
  }
  async function register(email, password, name) {
    const { token, user: u } = await apiRegister(email, password, name);
    setToken(token);
    setUser(u);
    return u;
  }
  function logout() {
    setToken('');
    setUser(null);
  }

  return <AuthCtx.Provider value={{ user, ready, login, register, logout }}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth fora do AuthProvider');
  return ctx;
}
