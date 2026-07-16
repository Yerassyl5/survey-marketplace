"use client";

/* ────────────────────────────────────────────────────────────────────────
   BidOutcomeBadge.tsx — статус ОТКЛИКА (Bid) в таблице «Мои отклики», не
   заявки (Request). Отдельная сущность от Badge.tsx/StatusBadge/
   STATUS_LABELS: тот словарь — для Request.status, который видит только
   заказчик-владелец (инвариант №9, architecture.md §4.3). Здесь —
   вычисляемое значение из пары Bid.status/Bid.considered_at, которое видит
   исполнитель про СВОЙ отклик («Мои отклики», PRODUCT_SPEC 1.4). Смешивать
   два словаря нельзя: разные сущности, разный источник данных (вычисление
   vs поле из БД).

   ТРИ состояния в таблице (не пять) — намеренное решение продукта:
   selected и rejected схлопнуты в одну метку «Подведены итоги». В таблице
   исполнитель не узнаёт, выиграл он или нет — узнаёт, только провалившись
   внутрь заявки (там честные пять состояний, см. MyBidStatusPanel.tsx).

   ВАЖНО: переход «Ожидает рассмотрения» → «Подведены итоги» МИНУЯ
   «На рассмотрении» — валидный и частый путь, не баг. AwardView массово
   переводит ВСЕ pending-отклики заявки в rejected одним update() независимо
   от considered_at (см. backend/apps/marketplace/views.py::AwardView) —
   отклик, который заказчик вообще не открывал, тоже сразу получает
   «Подведены итоги».
   ──────────────────────────────────────────────────────────────────────── */

import type { CSSProperties } from "react";

import type { MyBid } from "@/lib/api/marketplace";

export type BidOutcomeLabel = "Ожидает рассмотрения" | "На рассмотрении" | "Подведены итоги";

export function getBidOutcomeLabel(bid: Pick<MyBid, "status" | "considered_at">): BidOutcomeLabel {
  if (bid.status !== "pending") return "Подведены итоги";
  return bid.considered_at ? "На рассмотрении" : "Ожидает рассмотрения";
}

// Токены переиспользованы из уже существующей палитры (globals.css) — новых
// не заводим. «Подведены итоги» НЕ несёт исход (WCAG 1.4.1 тут не при чём:
// цвет не различает не потому, что дублирует текст, а потому что сам текст
// по решению продукта не должен намекать на исход) — поэтому не зелёный
// (= победа) и не --ds-review (занят «На рассмотрении»). --ds-new (синий) —
// из той же статусной семьи токенов, семантика «итог есть, зайдите
// посмотрите»; нигде больше в этом компоненте не занят.
const BID_OUTCOME_VARS: Record<BidOutcomeLabel, { bg: string; color: string }> = {
  "Ожидает рассмотрения": { bg: "var(--ds-done-bg)", color: "var(--ds-done-text)" },
  "На рассмотрении":      { bg: "var(--ds-review-bg)", color: "var(--ds-review-text)" },
  "Подведены итоги":      { bg: "var(--ds-new-bg)",  color: "var(--ds-new-text)"  },
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
