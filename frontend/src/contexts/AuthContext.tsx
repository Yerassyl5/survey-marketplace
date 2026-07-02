"use client";

/* ────────────────────────────────────────────────────────────────────────
   AuthContext — состояние текущего пользователя на клиенте.
   При монтировании (root layout) проверяет, есть ли сохранённый access,
   и если есть — подтягивает GET /me/. Пока идёт проверка — isLoading=true,
   этим пользуется (app)/layout.tsx для guard'а приватных страниц.
   ──────────────────────────────────────────────────────────────────────── */

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

import * as authApi from "@/lib/api/auth";
import { getAccessToken } from "@/lib/api/tokens";
import type { MeResponse } from "@/lib/api/types";

interface AuthContextValue {
  user: MeResponse | null;
  isLoading: boolean;
  login: (email: string, password: string, remember?: boolean) => Promise<MeResponse>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<MeResponse | null>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MeResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    if (!getAccessToken()) {
      setUser(null);
      return null;
    }
    try {
      const data = await authApi.me();
      setUser(data);
      return data;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await refreshUser();
      if (!cancelled) setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshUser]);

  const login = useCallback(async (email: string, password: string, remember: boolean = true) => {
    await authApi.login({ email, password }, remember);
    const data = await authApi.me();
    setUser(data);
    return data;
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth должен использоваться внутри <AuthProvider>");
  }
  return ctx;
}
