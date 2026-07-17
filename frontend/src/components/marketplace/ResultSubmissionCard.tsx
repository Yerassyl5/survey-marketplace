"use client";

/* ────────────────────────────────────────────────────────────────────────
   ResultSubmissionCard.tsx — карточка результата в ОСНОВНОЙ колонке
   /requests/[id] у ИСПОЛНИТЕЛЯ-победителя (не в сайдбаре, см.
   MyBidStatusPanel.tsx): MultiFilePicker+Textarea тесны рядом со
   статус-панелью в 320px, здесь — та же ширина, что у карточек «Описание»/
   «ТЗ»/«Расположение объекта».

   Ветвится по requestStatus:
   - "awarded", нет записей — только форма сдачи, заголовок «Сдать результат».
   - "awarded", есть записи (после возврата) — лента + подзаголовок «Сдать
     результат» + форма. НЕТ отдельного баннера с причиной возврата — лента
     уже показывает последнюю запись "Заказчик вернул: <причина>" прямо над
     формой, баннер дублировал бы те же слова (решение 2026-07-17, по
     превью — дубль читался как недоработка).
   - "result_submitted" — лента + текст «на проверке у заказчика», БЕЗ формы:
     SubmitResultView принимает только awarded/result_submitted, но при
     result_submitted досдача уже покрыта (см. views.py — повторный submit
     без return допишет в открытое событие); текст здесь просто честно
     говорит, что сейчас ход заказчика.
   - "accepted" — лента, без действий (сделка закрыта, финальная запись
     "Заказчик принял" сама по себе это говорит — отдельного баннера нет,
     тот же принцип, что и у отсутствующего баннера возврата выше).
   ──────────────────────────────────────────────────────────────────────── */

import { useState } from "react";
import type { FormEvent } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/button";
import { MultiFilePicker } from "@/components/ui/MultiFilePicker";
import { Textarea } from "@/components/ui/Textarea";
import { ResultThread } from "@/components/marketplace/ResultThread";
import { useRouter as useI18nRouter } from "@/i18n/navigation";
import { AuthRequiredError } from "@/lib/api/client";
import { submitResult } from "@/lib/api/marketplace";
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

const subHeadingStyle = {
  fontFamily: "var(--ds-font-heading)",
  fontSize: 15,
  fontWeight: 700,
  color: "var(--ds-text)",
  margin: "20px 0 12px",
} as const;

const waitingNoteStyle = {
  marginTop: 18,
  paddingTop: 16,
  borderTop: "1px solid var(--ds-border)",
  fontFamily: "var(--ds-font-body)",
  fontSize: 13,
  color: "var(--ds-text-muted)",
  fontStyle: "italic" as const,
};

export interface ResultSubmissionCardProps {
  requestId: number;
  requestStatus: MyRequest["status"];
  resultEntries: ResultEntry[];
  onSubmitResultSuccess: () => void;
}

export function ResultSubmissionCard({
  requestId,
  requestStatus,
  resultEntries,
  onSubmitResultSuccess,
}: ResultSubmissionCardProps) {
  const i18nRouter = useI18nRouter();
  const [filesToSubmit, setFilesToSubmit] = useState<File[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const hasEntries = resultEntries.length > 0;
  // Первая сдача (нет ни одной записи) требует файл — see backend
  // SubmitResultView has_existing-проверка. Любая последующая сдача
  // (досдача без возврата ИЛИ после возврата — обе уже дают hasEntries) —
  // файл не обязателен, можно просто дописать комментарий.
  const requiresFile = !hasEntries;
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

  if (requestStatus === "accepted") {
    return (
      <div style={cardStyle}>
        <h2 style={titleStyle}>Результат</h2>
        <ResultThread entries={resultEntries} />
      </div>
    );
  }

  if (requestStatus === "result_submitted") {
    return (
      <div style={cardStyle}>
        <h2 style={titleStyle}>Результат</h2>
        <ResultThread entries={resultEntries} />
        <p style={waitingNoteStyle}>Результат на проверке у заказчика.</p>
      </div>
    );
  }

  // requestStatus === "awarded"
  return (
    <div style={cardStyle}>
      <h2 style={titleStyle}>{hasEntries ? "Результат" : "Сдать результат"}</h2>
      {hasEntries && (
        <>
          <ResultThread entries={resultEntries} />
          <h3 style={subHeadingStyle}>Сдать результат</h3>
        </>
      )}
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
