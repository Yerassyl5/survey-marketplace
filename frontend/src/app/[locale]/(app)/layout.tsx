"use client";

/* ────────────────────────────────────────────────────────────────────────
   (app)/layout.tsx — guard приватных экранов.
   Токены живут в localStorage (см. docs/progress.md — техдолг "хранение
   JWT"), поэтому proxy.ts их не видит и не может редиректить server-side.
   Проверка — на клиенте: пока AuthContext не определился (isLoading) —
   спиннер; если пользователя нет — редирект на /login.
   ──────────────────────────────────────────────────────────────────────── */

import { useEffect } from "react";
import type { ReactNode } from "react";

import { AppNav } from "@/components/ui/AppNav";
import { AppFooter } from "@/components/ui/AppFooter";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "@/i18n/navigation";

function Spinner() {
  return (
    <div
      role="status"
      aria-label="Загрузка"
      style={{
        width: 32,
        height: 32,
        border: "3px solid var(--ds-border)",
        borderTopColor: "var(--ds-blue)",
        borderRadius: "50%",
        animation: "progeo-spin 700ms linear infinite",
      }}
    />
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [isLoading, user, router]);

  if (isLoading || !user) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--ds-bg)",
        }}
      >
        <Spinner />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--ds-bg)" }}>
      <AppNav variant="app" user={{ name: user.full_name, role: user.role }} />
      <main style={{ flex: 1 }}>{children}</main>
      <AppFooter compact />
    </div>
  );
}
