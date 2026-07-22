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
import type { AppNavLink } from "@/components/ui/AppNav";
import { AppFooter } from "@/components/ui/AppFooter";
import { useAuth } from "@/contexts/AuthContext";
import { usePathname, useRouter } from "@/i18n/navigation";
import type { MeResponse } from "@/lib/api/types";

// Ссылки навигации по роли — дефолтный экран заказчика «Мои заявки», общую
// ленту открывает по желанию (видит её обезличенно, откликаться не может).
// «Профиль» здесь больше НЕТ — переехал в выпадающее меню user-chip'а
// (AppNav, только для contractor), горизонтальное меню — не то место для
// него по итогам браузерной проверки.
function navLinksFor(user: MeResponse): AppNavLink[] {
  if (user.role === "customer") {
    return [
      { label: "Мои заявки", href: "/ru/requests/my" },
      { label: "Лента заявок", href: "/ru/feed" },
    ];
  }
  return [
    { label: "Лента заявок", href: "/ru/feed" },
    { label: "Мои отклики", href: "/ru/requests/my-bids" },
    { label: "Мои сделки", href: "/ru/requests/my-work" },
  ];
}

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
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Обычный выход (не путать со сменой пароля на /ru/settings — там refresh
  // уже блеклистнут бэкендом, обычный logout() туда не годится, см. её
  // докстринг). Здесь токен ещё живой — logout() спокойно шлёт
  // POST /accounts/logout/ и блеклистит именно его.
  async function handleLogout() {
    await logout();
    router.replace("/login");
  }
  // "/requests/my-bids".startsWith("/requests/my") тоже true — префиксом не
  // разойтись, нужна граница сегмента (/requests/my либо /requests/my/...).
  // "Профиль" здесь больше не подсвечивается — его нет в горизонтальном меню
  // (переехал в выпадашку user-chip'а, у выпадашки подсветки активного
  // пункта не предусмотрено вовсе).
  const activeLink = pathname.startsWith("/feed")
    ? "Лента заявок"
    : pathname === "/requests/my" || pathname.startsWith("/requests/my/")
      ? "Мои заявки"
      : pathname.startsWith("/requests/my-work")
        ? "Мои сделки"
        : pathname.startsWith("/requests/my-bids")
          ? "Мои отклики"
          : undefined;

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
      <AppNav
        variant="app"
        activeLink={activeLink}
        user={{ id: user.id, name: user.full_name, role: user.role }}
        links={navLinksFor(user)}
        onLogout={handleLogout}
      />
      <main style={{ flex: 1 }}>{children}</main>
      <AppFooter compact />
    </div>
  );
}
