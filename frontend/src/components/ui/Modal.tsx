"use client";

/* ────────────────────────────────────────────────────────────────────────
   Modal.tsx — обёртка над нативным <dialog>: focus trap, Esc, ::backdrop
   и позиционирование в top layer — всё бесплатно от браузера, не пишем
   руками. Стили ::backdrop — глобально в globals.css (React inline-стили
   не достают до псевдо-элементов).
   ──────────────────────────────────────────────────────────────────────── */

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function Modal({ open, onClose, title, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        // Клик по ::backdrop приходит как клик по самому <dialog> (не по
        // содержимому внутри) — так native-паттерн различает "мимо" от "внутрь".
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="modal-title"
      style={{
        border: "none",
        padding: 0,
        borderRadius: "var(--ds-r-lg)",
        background: "var(--ds-bg-white)",
        width: "min(480px, calc(100vw - 32px))",
        color: "var(--ds-text)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "20px 24px",
          borderBottom: "1px solid var(--ds-border)",
        }}
      >
        <h2
          id="modal-title"
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
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 32,
            height: 32,
            border: "none",
            background: "transparent",
            borderRadius: "var(--ds-r-md)",
            color: "var(--ds-text-muted)",
            cursor: "pointer",
            transition: "background 150ms, color 150ms",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--ds-bg)";
            e.currentTarget.style.color = "var(--ds-text)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--ds-text-muted)";
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <div style={{ padding: 24 }}>{children}</div>
    </dialog>
  );
}
