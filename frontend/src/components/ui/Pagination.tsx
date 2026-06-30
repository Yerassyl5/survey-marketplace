"use client";

/* ────────────────────────────────────────────────────────────────────────
   Pagination.tsx — институциональная пагинация
   Props: currentPage, totalPages, onPageChange
   Показывает до 7 кнопок: [1] ... [n-1] [n] [n+1] ... [last]
   ──────────────────────────────────────────────────────────────────────── */

import type { CSSProperties } from "react";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

const ChevronLeft = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const ChevronRight = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

function getPages(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "...", total];
  if (current >= total - 3) return [1, "...", total - 4, total - 3, total - 2, total - 1, total];
  return [1, "...", current - 1, current, current + 1, "...", total];
}

export function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages = getPages(currentPage, totalPages);

  const btnBase: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 32,
    height: 32,
    padding: "0 8px",
    border: "1px solid var(--ds-border)",
    borderRadius: "var(--ds-r-md)",
    fontSize: 13,
    fontFamily: "var(--ds-font-body)",
    cursor: "pointer",
    transition: "background 150ms, border-color 150ms, color 150ms",
    background: "var(--ds-bg-white)",
    color: "var(--ds-text-sec)",
  };

  const activeStyle: CSSProperties = {
    ...btnBase,
    background: "var(--ds-blue)",
    border: "1px solid var(--ds-blue)",
    color: "#FFFFFF",
    fontWeight: 600,
    cursor: "default",
  };

  const disabledStyle: CSSProperties = {
    ...btnBase,
    opacity: 0.4,
    cursor: "not-allowed",
  };

  return (
    <nav
      aria-label="Пагинация"
      style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}
    >
      {/* Назад */}
      <button
        onClick={() => currentPage > 1 && onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        aria-label="Предыдущая страница"
        style={currentPage === 1 ? disabledStyle : btnBase}
      >
        <ChevronLeft />
      </button>

      {/* Страницы */}
      {pages.map((p, i) =>
        p === "..." ? (
          <span
            key={`dots-${i}`}
            style={{
              ...btnBase,
              cursor: "default",
              border: "none",
              background: "transparent",
              color: "var(--ds-text-muted)",
            }}
          >
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => p !== currentPage && onPageChange(p as number)}
            aria-label={`Страница ${p}`}
            aria-current={p === currentPage ? "page" : undefined}
            style={p === currentPage ? activeStyle : btnBase}
          >
            {p}
          </button>
        )
      )}

      {/* Вперёд */}
      <button
        onClick={() => currentPage < totalPages && onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        aria-label="Следующая страница"
        style={currentPage === totalPages ? disabledStyle : btnBase}
      >
        <ChevronRight />
      </button>
    </nav>
  );
}
