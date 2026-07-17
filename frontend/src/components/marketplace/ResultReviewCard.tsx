"use client";

/* ────────────────────────────────────────────────────────────────────────
   ResultReviewCard.tsx — карточка результата в ОСНОВНОЙ колонке
   /requests/[id] у ЗАКАЗЧИКА-владельца (тот же слот, что
   ResultSubmissionCard у исполнителя — симметрично по роли). Рендерится
   для всей заявки с назначенным исполнителем (awarded/result_submitted/
   accepted) — раньше рендерилась только на result_submitted/accepted,
   теперь и на awarded тоже, иначе блок исчезал ровно там, где заказчику
   нужнее всего видеть, что работа идёт (и не показывать пустой рельс
   ленты, когда сдач ещё не было вовсе).

   Ветвится:
   - 0 записей (awarded, ещё не сдавал) — тихий текст, лента не рисуется.
   - есть записи, "awarded" (после возврата) — только лента, действий нет
     (ждём исполнителя).
   - "result_submitted" — лента + кнопки «Принять»/«Вернуть на доработку».
   - "accepted" — только лента, без действий и без отдельного баннера
     «сделка закрыта» — финальная запись "Заказчик принял" в самой ленте
     это уже говорит (решение 2026-07-17, тот же принцип, что и у
     отсутствующего баннера причины возврата в ResultSubmissionCard).

   "Принять" — обычный ConfirmDialog (необратимо, без ввода), тем же
   паттерном, что award в BidsPanel. "Вернуть на доработку" —
   ReturnResultDialog (обёртка над ConfirmDialog, ConfirmDialog не менялся).
   ──────────────────────────────────────────────────────────────────────── */

import { useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ResultThread } from "@/components/marketplace/ResultThread";
import { ReturnResultDialog } from "@/components/marketplace/ReturnResultDialog";
import { useRouter as useI18nRouter } from "@/i18n/navigation";
import { AuthRequiredError } from "@/lib/api/client";
import { acceptResult, returnResult } from "@/lib/api/marketplace";
import type { MyRequest, ResultEntry } from "@/lib/api/marketplace";
import { ApiError } from "@/lib/api/types";

const cardStyle = {
  padding: 24,
  background: "var(--ds-bg-white)",
  border: "1px solid var(--ds-border)",
  borderRadius: "var(--ds-r-lg)",
} as const;

const titleStyle = {
  fontFamily: "var(--ds-font-heading)",
  fontSize: 16,
  fontWeight: 700,
  color: "var(--ds-text)",
  margin: "0 0 12px",
} as const;

export interface ResultReviewCardProps {
  requestId: number;
  requestStatus: Extract<MyRequest["status"], "awarded" | "result_submitted" | "accepted">;
  resultEntries: ResultEntry[];
  onAcceptSuccess: () => void;
  onReturnSuccess: () => void;
}

export function ResultReviewCard({
  requestId,
  requestStatus,
  resultEntries,
  onAcceptSuccess,
  onReturnSuccess,
}: ResultReviewCardProps) {
  const i18nRouter = useI18nRouter();
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const hasEntries = resultEntries.length > 0;
  const canAct = requestStatus === "result_submitted";

  async function handleAccept() {
    setIsSubmitting(true);
    setActionError(null);
    try {
      await acceptResult(requestId);
      setAcceptOpen(false);
      onAcceptSuccess();
    } catch (err) {
      if (err instanceof AuthRequiredError) {
        i18nRouter.replace("/login");
        return;
      }
      setActionError(err instanceof ApiError ? err.message : "Не удалось принять результат.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleReturn(note: string) {
    setIsSubmitting(true);
    setActionError(null);
    try {
      await returnResult(requestId, note);
      setReturnOpen(false);
      onReturnSuccess();
    } catch (err) {
      if (err instanceof AuthRequiredError) {
        i18nRouter.replace("/login");
        return;
      }
      setActionError(err instanceof ApiError ? err.message : "Не удалось вернуть на доработку.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div style={cardStyle}>
      <h2 style={titleStyle}>Результат</h2>

      {hasEntries ? (
        <ResultThread entries={resultEntries} />
      ) : (
        <p style={{ fontFamily: "var(--ds-font-body)", fontSize: 13.5, color: "var(--ds-text-muted)", margin: 0 }}>
          Работа началась, ждём сдачи результата от исполнителя.
        </p>
      )}

      {canAct && (
        <>
          {actionError && (
            <div style={{ marginTop: 14 }}>
              <Alert variant="error">{actionError}</Alert>
            </div>
          )}
          <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
            <Button
              type="button"
              onClick={() => {
                setActionError(null);
                setAcceptOpen(true);
              }}
            >
              Принять
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setActionError(null);
                setReturnOpen(true);
              }}
            >
              Вернуть на доработку
            </Button>
          </div>
        </>
      )}

      <ConfirmDialog
        open={acceptOpen}
        title="Принять результат?"
        description="Действие необратимо — заявка перейдёт в статус «Закрыта»."
        confirmLabel="Принять"
        cancelLabel="Отмена"
        isConfirming={isSubmitting}
        error={actionError}
        onConfirm={handleAccept}
        onCancel={() => {
          if (isSubmitting) return;
          setAcceptOpen(false);
          setActionError(null);
        }}
      />

      <ReturnResultDialog
        open={returnOpen}
        isSubmitting={isSubmitting}
        error={actionError}
        onConfirm={handleReturn}
        onCancel={() => {
          if (isSubmitting) return;
          setReturnOpen(false);
          setActionError(null);
        }}
      />
    </div>
  );
}
