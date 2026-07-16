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

   Форма сдачи результата и список сданных файлов — В ОТДЕЛЬНОМ компоненте
   (см. ResultSubmissionCard.tsx, рендерится в основной колонке page.tsx, не
   здесь): MultiFilePicker+Textarea тесны в сайдбаре 320px рядом с этой
   панелью. Здесь остаётся только СТАТУС-ТЕКСТ по requestStatus (три
   варианта текста для bid.status === "selected") — это текст, не форма.
   requestStatus отсутствует (undefined), если bid.status !== "selected" —
   раскрытие бэкенда (RequestFeedDetailSerializer, условие
   assigned_contractor_id === viewer.id) привязано к победителю, для
   pending/rejected доп. текстов не требуется.
   ──────────────────────────────────────────────────────────────────────── */

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { formatDate } from "@/components/ui/RequestRow";
import { useRouter as useI18nRouter } from "@/i18n/navigation";
import { AuthRequiredError } from "@/lib/api/client";
import { withdrawBid } from "@/lib/api/marketplace";
import type { MyBidBrief, MyRequest } from "@/lib/api/marketplace";
import { ApiError } from "@/lib/api/types";

type PanelTone = "active" | "review" | "done";

function getStatusMessage(
  bid: Pick<MyBidBrief, "status" | "considered_at">,
  requestStatus: MyRequest["status"] | undefined,
): { heading: string; body?: string; tooltip?: string; tone: PanelTone } {
  if (bid.status === "selected") {
    if (requestStatus === "result_submitted") {
      return { heading: "Результат отправлен, ждём подтверждения заказчика", tone: "review" };
    }
    if (requestStatus === "accepted") {
      return { heading: "Заявка закрыта, результат принят", tone: "done" };
    }
    return {
      heading: "Поздравляем, вас выбрали исполнителем!",
      body: "После того как выполните все работы на объекте, сдайте результат — приложите все сопутствующие файлы в форме сдачи ниже на этой странице.",
      tone: "active",
    };
  }
  if (bid.status === "rejected") {
    // Различие двух веток — по considered_at, НЕ по факту раскрытия цены/срока/комментария:
    // это заказчик видит у ВСЕХ откликов всегда. considered_at означает, что заказчик раскрыл
    // телефон исполнителя (см. ConsiderBidView) — то есть предложение заинтересовало настолько,
    // чтобы связаться, а не просто было просмотрено в списке.
    return bid.considered_at
      ? {
          heading: "Заказчик рассмотрел ваш отклик, но выбрал другого исполнителя",
          tooltip:
            "Ваше предложение заинтересовало заказчика — он раскрыл ваш контакт для связи. Но в итоге выбрал другого исполнителя. На этом шаге цена и срок уже устроили заказчика; решают обычно другие факторы — статус верификации, портфолио, отзывы, опыт на похожих объектах или условия других исполнителей. Заполненный профиль и пройденная верификация повышают шансы в следующий раз.",
          tone: "done",
        }
      : {
          heading: "Заказчик выбрал другого исполнителя, не рассматривая ваш отклик",
          tooltip:
            "Заказчик видел ваше предложение, но не заинтересовался настолько, чтобы связаться с вами. Чаще всего на этом шаге решают цена и срок. Цена, резко выбивающаяся из других откликов, настораживает: слишком низкая читается как неопытность или спешка, слишком высокая — как переплата. Стоит свериться, насколько ваше предложение соответствует рыночному, и обратить внимание на срок и комментарий к отклику.",
          tone: "done",
        };
  }
  return bid.considered_at
    ? { heading: "Заказчик рассматривает ваш отклик", tone: "review" }
    : { heading: "Ваш отклик отправлен, заказчик его ещё не рассмотрел", tone: "done" };
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
  requestStatus?: MyRequest["status"];
  onWithdrawSuccess: () => void;
}

export function MyBidStatusPanel({ bid, requestStatus, onWithdrawSuccess }: MyBidStatusPanelProps) {
  const i18nRouter = useI18nRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  const canWithdraw = bid.status === "pending" && !bid.considered_at;
  const { heading, body, tooltip, tone } = getStatusMessage(bid, requestStatus);
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
          display: "flex",
          flexDirection: "column",
          gap: body ? 6 : 0,
          padding: "14px 16px",
          borderRadius: "var(--ds-r-md)",
          background: toneVars.bg,
          color: toneVars.color,
          fontFamily: "var(--ds-font-body)",
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 6,
            position: tooltip ? "relative" : undefined,
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.4 }}>{heading}</span>
          {tooltip && <InfoTooltip text={tooltip} placement="bottom" />}
        </div>
        {body && (
          <p style={{ fontSize: 13, fontWeight: 400, lineHeight: 1.5, margin: 0 }}>{body}</p>
        )}
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
