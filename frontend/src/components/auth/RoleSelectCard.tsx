"use client";

/* ────────────────────────────────────────────────────────────────────────
   RoleSelectCard.tsx — крупная кликабельная карточка выбора роли
   (Заказчик / Исполнитель) на экране регистрации.
   Семантика: набор карточек оборачивается родителем в role="radiogroup",
   каждая карточка — role="radio" (одиночный выбор, как радио-кнопки).
   ──────────────────────────────────────────────────────────────────────── */

import type { CSSProperties, ReactNode } from "react";

export interface RoleSelectCardProps {
  title: string;
  description: string;
  icon?: ReactNode;
  selected: boolean;
  onSelect: () => void;
}

export function RoleSelectCard({ title, description, icon, selected, onSelect }: RoleSelectCardProps) {
  const style: CSSProperties = {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: 20,
    textAlign: "left",
    borderRadius: "var(--ds-r-lg)",
    border: `2px solid ${selected ? "var(--ds-blue)" : "var(--ds-border)"}`,
    background: selected ? "var(--ds-blue-xlight)" : "var(--ds-bg-white)",
    cursor: "pointer",
    transition: "border-color 150ms, background 150ms",
  };

  return (
    <button type="button" role="radio" aria-checked={selected} onClick={onSelect} style={style}>
      {icon}
      <span
        style={{
          fontFamily: "var(--ds-font-heading)",
          fontSize: 16,
          fontWeight: 700,
          color: "var(--ds-text)",
        }}
      >
        {title}
      </span>
      <span
        style={{
          fontFamily: "var(--ds-font-body)",
          fontSize: 13,
          color: "var(--ds-text-sec)",
          lineHeight: 1.5,
        }}
      >
        {description}
      </span>
    </button>
  );
}
