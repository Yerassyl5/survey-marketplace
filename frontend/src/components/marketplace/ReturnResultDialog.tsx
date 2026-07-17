"use client";

/* ────────────────────────────────────────────────────────────────────────
   ReturnResultDialog.tsx — «Вернуть на доработку?» с обязательным полем
   причины. Обёртка НАД ConfirmDialog, сам ConfirmDialog НЕ меняется —
   description принимает ReactNode, туда и кладём Textarea с локальным
   состоянием причины. Валидация «причина обязательна» — через уже
   существующий error-проп ConfirmDialog (тот же слот, что показывает
   серверные ошибки), не через несуществующий disabled на кнопке
   подтверждения: пустая причина по клику «Вернуть» ставит ошибку и не
   вызывает onConfirm, диалог остаётся открытым.

   note/validationError сбрасываются в onCancel (клик «Отмена»/фон/Escape —
   всё это уже идёт через один проп ConfirmDialog). Успешная отправка
   отдельного сброса не требует: после неё requestStatus уходит из
   {result_submitted, accepted}, ResultReviewCard (и этот диалог внутри
   него) размонтируется целиком вместе со своим useState — эффект на open
   для этого не нужен (react-hooks/set-state-in-effect и не разрешил бы). */

import { useState } from "react";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Textarea } from "@/components/ui/Textarea";

export interface ReturnResultDialogProps {
  open: boolean;
  isSubmitting: boolean;
  /** Серверная ошибка последней попытки — отдельно от клиентской валидации
   * (validationError ниже), но показываются в одном и том же слоте. */
  error: string | null;
  onConfirm: (note: string) => void;
  onCancel: () => void;
}

export function ReturnResultDialog({ open, isSubmitting, error, onConfirm, onCancel }: ReturnResultDialogProps) {
  const [note, setNote] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  function handleCancel() {
    setNote("");
    setValidationError(null);
    onCancel();
  }

  function handleConfirm() {
    const trimmed = note.trim();
    if (!trimmed) {
      setValidationError("Укажите причину — без неё исполнитель не поймёт, что исправить.");
      return;
    }
    setValidationError(null);
    onConfirm(trimmed);
  }

  return (
    <ConfirmDialog
      open={open}
      title="Вернуть на доработку?"
      description={
        <Textarea
          rows={4}
          placeholder="Что нужно исправить?"
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            if (validationError) setValidationError(null);
          }}
          hasError={!!validationError}
          autoFocus
        />
      }
      confirmLabel="Вернуть"
      cancelLabel="Отмена"
      isConfirming={isSubmitting}
      error={validationError ?? error}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  );
}
