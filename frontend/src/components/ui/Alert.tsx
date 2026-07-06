"use client";

/* ────────────────────────────────────────────────────────────────────────
   Alert.tsx — баннер уровня формы (не поля): неверный логин, серверная
   ошибка, предупреждение о верификации. variant="error" объявляется через
   role="alert" (озвучивается сразу), variant="info" — role="status".
   ──────────────────────────────────────────────────────────────────────── */

import type { CSSProperties, ReactNode } from "react";

export interface AlertProps {
  variant?: "error" | "info" | "warning";
  children: ReactNode;
}

const VARIANT_STYLE: Record<NonNullable<AlertProps["variant"]>, { bg: string; color: string; border: string }> = {
  error: { bg: "var(--ds-error-bg)", color: "var(--ds-error)", border: "var(--ds-error)" },
  info: { bg: "var(--ds-blue-xlight)", color: "var(--ds-blue)", border: "var(--ds-blue)" },
  // Тот же амбер, что у статуса «Выбор исполнителя» (--ds-select-*) — семантика
  // «требует внимания, не ошибка»: используется для примечания заказчика исполнителям.
  warning: { bg: "var(--ds-select-bg)", color: "var(--ds-select-text)", border: "var(--ds-select-text)" },
};

export function Alert({ variant = "info", children }: AlertProps) {
  const s = VARIANT_STYLE[variant];
  const style: CSSProperties = {
    display: "flex",
    gap: 10,
    padding: "12px 14px",
    borderRadius: "var(--ds-r-md)",
    background: s.bg,
    border: `1px solid ${s.border}33`,
    color: s.color,
    fontFamily: "var(--ds-font-body)",
    fontSize: 13,
    lineHeight: 1.5,
  };

  return (
    <div style={style} role={variant === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}
