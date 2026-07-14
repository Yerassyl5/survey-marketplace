"use client";

/* ────────────────────────────────────────────────────────────────────────
   MyBidStatusPanel.tsx — сайдбар /requests/[id] для исполнителя, который
   уже откликнулся. Заменяет прежний RespondedBadge («Вы откликнулись») —
   тот был единственным состоянием на всё время после отклика, здесь пять
   честных состояний (в отличие от BidOutcomeBadge в таблице «Мои отклики»,
   где по решению продукта selected/rejected схлопнуты в «Подведены итоги» —
   здесь, внутри СВОЕЙ заявки, исход не прячем).

   Различие двух rejected принципиально: «рассмотрели и выбрали другого»
   (сигнал про цену/переговоры) vs «не рассматривали» (предложение отсеялось
   сразу, до сравнения) — исполнителю нужны оба, чтобы понимать, что
   улучшать (architecture.md §4.3).

   Кнопка «Отозвать отклик» — ТОЛЬКО pending && !considered_at (единственное
   состояние, где WithdrawBidView вернёт 200, см. backend/apps/marketplace/
   views.py::WithdrawBidView). В остальных четырёх кнопки нет вообще, не
   задизейблена — состояние, где отзыв уже невозможен, для этой кнопки не
   существует.
   ──────────────────────────────────────────────────────────────────────── */

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { formatDate } from "@/components/ui/RequestRow";
import { useRouter as useI18nRouter } from "@/i18n/navigation";
import { AuthRequiredError } from "@/lib/api/client";
import { withdrawBid } from "@/lib/api/marketplace";
import type { MyBidBrief } from "@/lib/api/marketplace";
import { ApiError } from "@/lib/api/types";

type PanelTone = "active" | "review" | "done";

function getStatusMessage(bid: Pick<MyBidBrief, "status" | "considered_at">): { text: string; tone: PanelTone } {
  if (bid.status === "selected") {
    return { text: "Вас выбрали исполнителем", tone: "active" };
  }
  if (bid.status === "rejected") {
    return bid.considered_at
      ? { text: "Заказчик рассмотрел ваш отклик, но выбрал другого исполнителя", tone: "done" }
      : { text: "Заказчик выбрал другого исполнителя, не рассматривая ваш отклик", tone: "done" };
  }
  return bid.considered_at
    ? { text: "Заказчик рассматривает ваш отклик", tone: "review" }
    : { text: "Ваш отклик отправлен, заказчик его ещё не рассмотрел", tone: "done" };
}

// Токены переиспользованы из уже существующей палитры — те же семьи, что
// красят «Выбран»/«На рассмотрении»/нейтраль в BidOutcomeBadge и BidsPanel.
const TONE_VARS: Record<PanelTone, { bg: string; color: string }> = {
  active: { bg: "var(--ds-active-bg)", color: "var(--ds-active-text)" },
  review: { bg: "var(--ds-review-bg)", color: "var(--ds-review-text)" },
  done: { bg: "var(--ds-done-bg)", color: "var(--ds-done-text)" },
};

export interface MyBidStatusPanelProps {
  bid: MyBidBrief;
  onWithdrawSuccess: () => void;
}

export function MyBidStatusPanel({ bid, onWithdrawSuccess }: MyBidStatusPanelProps) {
  const i18nRouter = useI18nRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  const canWithdraw = bid.status === "pending" && !bid.considered_at;
  const { text, tone } = getStatusMessage(bid);
  const toneVars = TONE_VARS[tone];

  async function handleWithdraw() {
    setIsWithdrawing(true);
    setWithdrawError(null);
    try {
      await withdrawBid(bid.id);
      setConfirmOpen(false);
      onWithdrawSuccess();
    } catch (err) {
      if (err instanceof AuthRequiredError) {
        i18nRouter.replace("/login");
        return;
      }
      setWithdrawError(err instanceof ApiError ? err.message : "Не удалось отозвать отклик.");
    } finally {
      setIsWithdrawing(false);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        padding: 24,
        background: "var(--ds-bg-white)",
        border: "1px solid var(--ds-border)",
        borderRadius: "var(--ds-r-lg)",
      }}
    >
      <div
        style={{
          padding: "14px 16px",
          borderRadius: "var(--ds-r-md)",
          background: toneVars.bg,
          color: toneVars.color,
          fontFamily: "var(--ds-font-body)",
          fontSize: 14,
          fontWeight: 600,
          lineHeight: 1.4,
        }}
      >
        {text}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h3
          style={{
            fontFamily: "var(--ds-font-heading)",
            fontSize: 15,
            fontWeight: 700,
            color: "var(--ds-text)",
            margin: 0,
          }}
        >
          Ваш отклик
        </h3>
        <div
          style={{
            display: "flex",
            gap: 20,
            flexWrap: "wrap",
            fontFamily: "var(--ds-font-body)",
            fontSize: 14,
            color: "var(--ds-text)",
          }}
        >
          <span>
            <strong>{Number(bid.price).toLocaleString("ru-RU")} ₸</strong>
          </span>
          <span>Срок: {bid.deadline_days} дн.</span>
        </div>
        {bid.comment && (
          <p
            style={{
              fontFamily: "var(--ds-font-body)",
              fontSize: 14,
              color: "var(--ds-text-sec)",
              margin: 0,
              whiteSpace: "pre-wrap",
            }}
          >
            {bid.comment}
          </p>
        )}
        <span style={{ fontFamily: "var(--ds-font-body)", fontSize: 13, color: "var(--ds-text-muted)" }}>
          Откликнулись {formatDate(bid.created_at)}
        </span>
      </div>

      {canWithdraw && (
        <Button type="button" variant="outline" onClick={() => setConfirmOpen(true)}>
          Отозвать отклик
        </Button>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Отозвать отклик?"
        description="После отзыва можно откликнуться заново с другой ценой, но место в очереди на рассмотрение теряется."
        confirmLabel="Отозвать"
        cancelLabel="Отмена"
        isConfirming={isWithdrawing}
        error={withdrawError}
        onConfirm={handleWithdraw}
        onCancel={() => {
          if (isWithdrawing) return;
          setConfirmOpen(false);
          setWithdrawError(null);
        }}
      />
    </div>
  );
}
