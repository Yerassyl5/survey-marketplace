"use client";

/* ────────────────────────────────────────────────────────────────────────
   Select.tsx — стилизованный нативный <select>, аналог Input.tsx.
   Вынесен из FilterBar.tsx при рефакторинге LocationCascadeSelect — теперь
   переиспользуется и фильтром ленты, и формой создания заявки.
   ──────────────────────────────────────────────────────────────────────── */

import { forwardRef } from "react";
import type { CSSProperties, SelectHTMLAttributes } from "react";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  hasError?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { hasError = false, style, ...props },
  ref,
) {
  const baseStyle: CSSProperties = {
    width: "100%",
    height: 40,
    padding: "0 12px",
    fontFamily: "var(--ds-font-body)",
    fontSize: 14,
    color: "var(--ds-text)",
    background: "var(--ds-bg-white)",
    border: `1px solid ${hasError ? "var(--ds-error)" : "var(--ds-border-str)"}`,
    borderRadius: "var(--ds-r-md)",
    outline: "none",
    cursor: "pointer",
    transition: "border-color 150ms, box-shadow 150ms",
  };
  return (
    <select
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
