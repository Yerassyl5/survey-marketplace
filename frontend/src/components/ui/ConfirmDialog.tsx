"use client";

/* ────────────────────────────────────────────────────────────────────────
   ConfirmDialog.tsx — базовый компонент подтверждения необратимого действия.
   Первое применение — выбор исполнителя (BidsPanel), дальше по MVP: приёмка
   результата, возврат на доработку, удаление заявки, отзыв — все da/net-
   подтверждения, не произвольный модальный контент, поэтому компонент
   называется по сути (ConfirmDialog), не общий Modal.

   Кнопка подтверждения ФИЗИЧЕСКИ не там, где была кнопка-триггер на
   странице — это и есть защита от клика по инерции/двойного клика, ради
   которой диалог вообще заводится (инлайн-подтверждение эту защиту не даёт).
   ──────────────────────────────────────────────────────────────────────── */

import { useEffect, useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/button";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Блокирует обе кнопки и показывает спиннер на подтверждении — пока идёт запрос. */
  isConfirming?: boolean;
  /** Текст ошибки последней попытки — диалог остаётся открытым, можно повторить. */
  error?: string | null;
  variant?: "default" | "danger";
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Подтвердить",
  cancelLabel = "Отмена",
  onConfirm,
  onCancel,
  isConfirming = false,
  error = null,
  variant = "default",
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Блокировка скролла страницы под диалогом + фокус на диалоге при открытии.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // Esc закрывает диалог (если не идёт запрос — не даём закрыть посреди отправки).
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape" && !isConfirming) {
        onCancel();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, isConfirming, onCancel]);

  if (!open) return null;

  function handleTrapTab(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Tab" || !dialogRef.current) return;
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(2, 6, 23, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        zIndex: "var(--ds-z-modal)",
      }}
      onClick={() => !isConfirming && onCancel()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleTrapTab}
        style={{
          width: "100%",
          maxWidth: 440,
          padding: 24,
          background: "var(--ds-bg-white)",
          border: "1px solid var(--ds-border)",
          borderRadius: "var(--ds-r-lg)",
          boxShadow: "0 20px 48px rgba(2, 6, 23, 0.25)",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <h2
          id="confirm-dialog-title"
          style={{
            fontFamily: "var(--ds-font-heading)",
            fontSize: 18,
            fontWeight: 700,
            color: "var(--ds-text)",
            margin: 0,
          }}
        >
          {title}
        </h2>

        {description && (
          <div style={{ fontFamily: "var(--ds-font-body)", fontSize: 14, lineHeight: 1.6, color: "var(--ds-text-sec)" }}>
            {description}
          </div>
        )}

        {error && <Alert variant="error">{error}</Alert>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 8 }}>
          <Button type="button" variant="outline" onClick={onCancel} disabled={isConfirming}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={variant === "danger" ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={isConfirming}
          >
            {isConfirming ? "Подождите…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
