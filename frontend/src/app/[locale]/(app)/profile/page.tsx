"use client";

/* ────────────────────────────────────────────────────────────────────────
   /ru/profile — редирект, не отдельный экран (этап 5).
   Исполнитель → /ru/contractors/{свой id} (публичная карточка — она же
   и есть его "профиль"). Заказчик → /ru/settings: у заказчика нет публичной
   карточки (инвариант скоупа блока «Профиль»), ближайший эквивалент "моей
   страницы" для него — приватные настройки, не страница-заглушка с ошибкой.
   (app)/layout.tsx уже гарантирует user !== null к моменту рендера children,
   поэтому здесь не нужен свой guard на isLoading — тот же принцип, что и на
   /ru/settings, /ru/contractors/[id].
   ──────────────────────────────────────────────────────────────────────── */

import { useEffect } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { useRouter as useI18nRouter } from "@/i18n/navigation";

export default function ProfileRedirectPage() {
  const { user } = useAuth();
  const i18nRouter = useI18nRouter();

  useEffect(() => {
    if (!user) return;
    i18nRouter.replace(user.role === "contractor" ? `/contractors/${user.id}` : "/settings");
  }, [user, i18nRouter]);

  return null;
}
