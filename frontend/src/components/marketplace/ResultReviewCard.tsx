"use client";

/* ────────────────────────────────────────────────────────────────────────
   ResultReviewCard.tsx — просмотр сданного результата ЗАКАЗЧИКОМ, основная
   колонка /requests/[id] (тот же слот, что ResultSubmissionCard у
   исполнителя — симметрично по роли). Рендерится ТОЛЬКО при status ∈
   {result_submitted, accepted} — на awarded файлов ещё нет, карточка не
   рендерится вовсе (см. DetailContent в page.tsx).

   "Принять" — обычный ConfirmDialog (необратимо, без ввода), тем же
   паттерном, что award в BidsPanel. "Вернуть на доработку" —
   ReturnResultDialog (обёртка над ConfirmDialog, ConfirmDialog не менялся).
   ──────────────────────────────────────────────────────────────────────── */

import { useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ResultFileList } from "@/components/marketplace/ResultFileList";
import { ReturnResultDialog } from "@/components/marketplace/ReturnResultDialog";
import { useRouter as useI18nRouter } from "@/i18n/navigation";
import { AuthRequiredError } from "@/lib/api/client";
import { acceptResult, returnResult } from "@/lib/api/marketplace";
import type { MyRequest, ResultFile } from "@/lib/api/marketplace";
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
  requestStatus: Extract<MyRequest["status"], "result_submitted" | "accepted">;
  resultFiles: ResultFile[];
  resultNote: string;
  onAcceptSuccess: () => void;
  onReturnSuccess: () => void;
}

export function ResultReviewCard({
  requestId,
  requestStatus,
  resultFiles,
  resultNote,
  onAcceptSuccess,
  onReturnSuccess,
}: ResultReviewCardProps) {
  const i18nRouter = useI18nRouter();
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const isClosed = requestStatus === "accepted";

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

      {isClosed && (
        <div
          style={{
            padding: "14px 16px",
            borderRadius: "var(--ds-r-md)",
            background: "var(--ds-active-bg)",
            color: "var(--ds-active-text)",
            fontFamily: "var(--ds-font-body)",
            fontSize: 14,
            fontWeight: 600,
            marginBottom: 16,
          }}
        >
          Результат принят, сделка закрыта
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {resultFiles.length > 0 ? (
          <ResultFileList files={resultFiles} />
        ) : (
          <p style={{ fontFamily: "var(--ds-font-body)", fontSize: 14, color: "var(--ds-text-muted)", margin: 0 }}>
            Файлы не найдены.
          </p>
        )}
        {resultNote && (
          <p
            style={{
              fontFamily: "var(--ds-font-body)",
              fontSize: 14,
              color: "var(--ds-text-sec)",
              margin: 0,
              whiteSpace: "pre-wrap",
            }}
          >
            {resultNote}
          </p>
        )}
      </div>

      {!isClosed && (
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
        description="Действие необратимо — сделка будет закрыта, вернуть заявку на доработку станет нельзя."
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
