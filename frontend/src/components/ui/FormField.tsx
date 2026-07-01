"use client";

/* ────────────────────────────────────────────────────────────────────────
   FormField.tsx — label + поле + подсказка/ошибка.
   Ошибка объявляется через role="alert" (озвучивается скринридером сразу),
   а не только цветом рамки поля (WCAG 1.4.1) — паттерн из ui-ux-pro-max
   (Result 3/6: aria-live для ошибок, label обязателен через for/id).
   ──────────────────────────────────────────────────────────────────────── */

import { cloneElement, isValidElement } from "react";
import type { CSSProperties, ReactElement, ReactNode } from "react";

type FieldChildProps = {
  id?: string;
  "aria-describedby"?: string;
  hasError?: boolean;
};

export interface FormFieldProps {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}

const labelStyle: CSSProperties = {
  fontFamily: "var(--ds-font-body)",
  fontSize: 13,
  fontWeight: 600,
  color: "var(--ds-text)",
};

const hintStyle: CSSProperties = {
  fontFamily: "var(--ds-font-body)",
  fontSize: 12,
  color: "var(--ds-text-muted)",
  margin: 0,
};

const errorStyle: CSSProperties = {
  fontFamily: "var(--ds-font-body)",
  fontSize: 12,
  fontWeight: 500,
  color: "var(--ds-error)",
  margin: 0,
};

export function FormField({ id, label, error, hint, required, children }: FormFieldProps) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  const child = isValidElement<FieldChildProps>(children)
    ? cloneElement(children as ReactElement<FieldChildProps>, {
        id,
        "aria-describedby": describedBy,
        hasError: Boolean(error),
      })
    : children;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label htmlFor={id} style={labelStyle}>
        {label}
        {required && <span style={{ color: "var(--ds-error)" }}> *</span>}
      </label>
      {child}
      {error ? (
        <p id={`${id}-error`} role="alert" style={errorStyle}>
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} style={hintStyle}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
