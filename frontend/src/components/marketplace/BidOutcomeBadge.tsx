"use client";

/* ────────────────────────────────────────────────────────────────────────
   BidOutcomeBadge.tsx — статус ОТКЛИКА (Bid), не заявки (Request).
   Отдельная сущность от Badge.tsx/StatusBadge/STATUS_LABELS: тот словарь —
   для Request.status, который видит только заказчик-владелец (инвариант №9,
   architecture.md §4.3). Здесь — вычисляемое значение из пары
   Bid.status/Bid.considered_at, которое видит исполнитель про СВОЙ отклик
   («Мои отклики», PRODUCT_SPEC 1.4). Смешивать два словаря нельзя: разные
   сущности, разный источник данных (вычисление vs поле из БД).

   Пять состояний (не четыре) — rejected различает ДВЕ разные причины:
   заказчик рассмотрел и выбрал другого (considered_at есть — «Не выбран»)
   vs заказчик выбрал другого, ДО того как дошёл до этого отклика
   (considered_at нет — «Заявка закрыта», нейтральная формулировка: этот
   отклик не отвергали, просто не успели рассмотреть).
   ──────────────────────────────────────────────────────────────────────── */

import type { CSSProperties } from "react";

import type { MyBid } from "@/lib/api/marketplace";

export type BidOutcomeLabel =
  | "Ожидает рассмотрения"
  | "Рассматривают"
  | "Выбран"
  | "Не выбран"
  | "Заявка закрыта";

export function getBidOutcomeLabel(bid: Pick<MyBid, "status" | "considered_at">): BidOutcomeLabel {
  if (bid.status === "selected") return "Выбран";
  if (bid.status === "rejected") return bid.considered_at ? "Не выбран" : "Заявка закрыта";
  return bid.considered_at ? "Рассматривают" : "Ожидает рассмотрения";
}

// Токены переиспользованы из уже существующей палитры (globals.css) — новых
// не заводим. «Ожидает»/«Не выбран»/«Заявка закрыта» намеренно делят один
// нейтральный цвет: различие между ними несёт текст метки, не цвет (тот же
// принцип WCAG 1.4.1, что уже описан у StatusBadge в Badge.tsx).
const BID_OUTCOME_VARS: Record<BidOutcomeLabel, { bg: string; color: string }> = {
  "Ожидает рассмотрения": { bg: "var(--ds-done-bg)",   color: "var(--ds-done-text)"   },
  "Рассматривают":        { bg: "var(--ds-review-bg)", color: "var(--ds-review-text)" },
  "Выбран":                { bg: "var(--ds-active-bg)", color: "var(--ds-active-text)" },
  "Не выбран":             { bg: "var(--ds-done-bg)",   color: "var(--ds-done-text)"   },
  "Заявка закрыта":       { bg: "var(--ds-done-bg)",   color: "var(--ds-done-text)"   },
};

const BADGE_STYLE: CSSProperties = {
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

export function BidOutcomeBadge({ bid }: { bid: Pick<MyBid, "status" | "considered_at"> }) {
  const label = getBidOutcomeLabel(bid);
  const vars = BID_OUTCOME_VARS[label];
  return (
    <span style={{ ...BADGE_STYLE, background: vars.bg, color: vars.color }}>
      {label}
    </span>
  );
}
