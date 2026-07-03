"use client";

/* ────────────────────────────────────────────────────────────────────────
   Textarea.tsx — многострочное поле, аналог Input.tsx для <textarea>.
   ──────────────────────────────────────────────────────────────────────── */

import { forwardRef } from "react";
import type { CSSProperties, TextareaHTMLAttributes } from "react";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  hasError?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { hasError = false, style, ...props },
  ref,
) {
  const baseStyle: CSSProperties = {
    width: "100%",
    minHeight: 80,
    padding: "10px 12px",
    fontFamily: "var(--ds-font-body)",
    fontSize: 14,
    lineHeight: 1.5,
    color: "var(--ds-text)",
    background: "var(--ds-bg-white)",
    border: `1px solid ${hasError ? "var(--ds-error)" : "var(--ds-border-str)"}`,
    borderRadius: "var(--ds-r-md)",
    outline: "none",
    resize: "vertical",
    transition: "border-color 150ms, box-shadow 150ms",
  };

  return (
    <textarea
      ref={ref}
      style={{ ...baseStyle, ...style }}
      aria-invalid={hasError || undefined}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = hasError ? "var(--ds-error)" : "var(--ds-blue)";
        e.currentTarget.style.boxShadow = `0 0 0 3px ${hasError ? "var(--ds-error-bg)" : "var(--ds-blue-xlight)"}`;
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = hasError ? "var(--ds-error)" : "var(--ds-border-str)";
        e.currentTarget.style.boxShadow = "none";
        props.onBlur?.(e);
      }}
      {...props}
    />
  );
});
