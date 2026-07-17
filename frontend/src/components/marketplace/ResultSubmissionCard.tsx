"use client";

/* ────────────────────────────────────────────────────────────────────────
   ResultSubmissionCard.tsx — карточка сдачи результата в ОСНОВНОЙ колонке
   /requests/[id] (не в сайдбаре, см. MyBidStatusPanel.tsx): MultiFilePicker
   (список файлов) + Textarea тесны рядом со статус-панелью в 320px, здесь —
   та же ширина, что у карточек «Описание»/«ТЗ»/«Расположение объекта».

   Рендерится ТОЛЬКО при bid.status === "selected" (победитель) — тот же
   признак, что уже использует MyBidStatusPanel. Ветвится по requestStatus:
   - "awarded" — форма сдачи.
   - "result_submitted"/"accepted" — список уже сданных файлов, БЕЗ формы:
     бэкенд (SubmitResultView) принимает только status=AWARDED, повторный
     вызов при result_submitted вернёт 404 — «досдать» возможно только
     после возврата на доработку (ReturnView, отдельный будущий шаг).
   ──────────────────────────────────────────────────────────────────────── */

import { useState } from "react";
import type { FormEvent } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/button";
import { MultiFilePicker } from "@/components/ui/MultiFilePicker";
import { Textarea } from "@/components/ui/Textarea";
import { ResultFileList } from "@/components/marketplace/ResultFileList";
import { useRouter as useI18nRouter } from "@/i18n/navigation";
import { AuthRequiredError } from "@/lib/api/client";
import { submitResult } from "@/lib/api/marketplace";
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

export interface ResultSubmissionCardProps {
  requestId: number;
  requestStatus: MyRequest["status"];
  resultFiles?: ResultFile[];
  resultNote?: string;
  onSubmitResultSuccess: () => void;
}

export function ResultSubmissionCard({
  requestId,
  requestStatus,
  resultFiles,
  resultNote,
  onSubmitResultSuccess,
}: ResultSubmissionCardProps) {
  const i18nRouter = useI18nRouter();
  const [filesToSubmit, setFilesToSubmit] = useState<File[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // При первой сдаче файл обязателен (see backend SubmitResultView
  // has_existing-проверка) — requestStatus === "awarded" в скоупе этого шага
  // всегда означает первую сдачу (return/повторная сдача — будущий шаг),
  // resultFiles?.length честно проверяем на случай, если он всё же непуст.
  const requiresFile = !(resultFiles && resultFiles.length > 0);
  const canSubmit = !requiresFile || filesToSubmit.length > 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (requiresFile && filesToSubmit.length === 0) return;

    setIsSubmitting(true);
    try {
      await submitResult(requestId, filesToSubmit, noteDraft);
      onSubmitResultSuccess();
    } catch (err) {
      if (err instanceof AuthRequiredError) {
        i18nRouter.replace("/login");
        return;
      }
      // Файлы и комментарий сознательно НЕ сбрасываем при ошибке — сеть
      // могла прерваться на середине загрузки, пользователь повторяет
      // отправку тем же набором файлов, не собирает список заново.
      setSubmitError(err instanceof ApiError ? err.message : "Не удалось сдать результат. Попробуйте ещё раз.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (requestStatus === "awarded") {
    return (
      <div style={cardStyle}>
        <h2 style={titleStyle}>Сдать результат</h2>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {submitError && <Alert variant="error">{submitError}</Alert>}
          <MultiFilePicker id="result-files" files={filesToSubmit} onChange={setFilesToSubmit} />
          <Textarea
            rows={3}
            placeholder="Комментарий к результату (необязательно)"
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
          />
          <Button type="submit" disabled={isSubmitting || !canSubmit} style={{ alignSelf: "flex-start" }}>
            {isSubmitting ? "Отправка…" : "Сдать результат"}
          </Button>
        </form>
      </div>
    );
  }

  if (requestStatus === "result_submitted" || requestStatus === "accepted") {
    return (
      <div style={cardStyle}>
        <h2 style={titleStyle}>Сданные файлы</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {resultFiles && resultFiles.length > 0 ? (
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
      </div>
    );
  }

  return null;
}
