"use client";

/* ────────────────────────────────────────────────────────────────────────
   Badge.tsx — StatusBadge и VerificationBadge
   Цвета берутся из CSS-переменных (globals.css --ds-*).
   Цвет — не единственный индикатор статуса (WCAG 1.4.1): есть текстовая метка.
   ──────────────────────────────────────────────────────────────────────── */

import type { CSSProperties } from "react";

/* ── StatusBadge ────────────────────────────────────────────────────────── */

// Метки соответствуют реальному жизненному циклу заявки (marketplace.RequestStatus:
// open → under_review → awarded → result_submitted → accepted), а не изначальному
// эскизу дизайн-системы («Выбор исполнителя» и т.п. — компонент был построен раньше
// вехи 1.4 и до этого коммита нигде не использовался с реальными данными).
export type RequestStatus =
  | "Новая"
  | "Ждёт рассмотрения"
  | "В работе"
  | "Результат сдан, примите работу"
  | "Закрыта";

const STATUS_VARS: Record<RequestStatus, { bg: string; color: string }> = {
  "Новая":                            { bg: "var(--ds-new-bg)",    color: "var(--ds-new-text)"    },
  "Ждёт рассмотрения":                { bg: "var(--ds-review-bg)", color: "var(--ds-review-text)" },
  // --ds-progress (индиго), НЕ --ds-active — тот красит статус ОТКЛИКА
  // («Выбран»/«Рассмотрен»/«Поздравляем» в MyBidStatusPanel/BidsPanel) —
  // другой смысл (позитив/успех отклика), чем «идёт процесс» у заявки.
  "В работе":                         { bg: "var(--ds-progress-bg)", color: "var(--ds-progress-text)" },
  "Результат сдан, примите работу":   { bg: "var(--ds-select-bg)", color: "var(--ds-select-text)" },
  // --ds-success (изумрудный) — отдельный от --ds-progress выше и от
  // --ds-active, три разных состояния не должны делить цвет.
  "Закрыта":                          { bg: "var(--ds-success-bg)", color: "var(--ds-success)"    },
};

const BADGE_BASE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "2px 10px",
  borderRadius: "var(--ds-r-pill)",
  fontSize: 11,
  fontWeight: 600,
  fontFamily: "var(--ds-font-body)",
  whiteSpace: "nowrap",
  lineHeight: 1.8,
};

interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const s = STATUS_VARS[status as RequestStatus] ?? {
    bg: "var(--ds-done-bg)",
    color: "var(--ds-done-text)",
  };
  return (
    <span style={{ ...BADGE_BASE, background: s.bg, color: s.color }}>
      {status}
    </span>
  );
}

/* ── VerificationBadge ──────────────────────────────────────────────────── */

const CheckIcon = () => (
  <svg
    width="10"
    height="10"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const CrossIcon = () => (
  <svg
    width="10"
    height="10"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

interface VerificationBadgeProps {
  verified: boolean;
  /** Показывать только иконку без текста (для компактных таблиц) */
  iconOnly?: boolean;
}

export function VerificationBadge({ verified, iconOnly = false }: VerificationBadgeProps) {
  if (verified) {
    return (
      <span
        title="Верифицирован"
        style={{
          ...BADGE_BASE,
          gap: 4,
          background: "var(--ds-ver-bg)",
          color: "var(--ds-ver-text)",
          border: "1px solid var(--ds-ver-border)",
        }}
      >
        <CheckIcon />
        {!iconOnly && "Верифицирован"}
      </span>
    );
  }

  return (
    <span
      title="Не верифицирован"
      style={{
        ...BADGE_BASE,
        gap: 4,
        background: "var(--ds-unver-bg)",
        color: "var(--ds-unver-text)",
        border: "1px solid var(--ds-unver-border)",
      }}
    >
      <CrossIcon />
      {!iconOnly && "Не верифицирован"}
    </span>
  );
}
