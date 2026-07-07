"use client";

/* ────────────────────────────────────────────────────────────────────────
   FilePicker.tsx — выбор одного файла: кнопка + имя/размер выбранного +
   удаление. Общий для ТЗ-файла заявки и уточняющей геометрии объекта
   (KML/GeoJSON) — обе формы показывают "что выбрано" одинаково.
   ──────────────────────────────────────────────────────────────────────── */

import { useRef } from "react";

export interface FilePickerProps {
  id: string;
  file: File | null;
  onChange: (file: File | null) => void;
  accept?: string;
  hasError?: boolean;
  buttonLabel?: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

export function FilePicker({ id, file, onChange, accept, hasError = false, buttonLabel = "Выбрать файл" }: FilePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: "hidden",
          clip: "rect(0,0,0,0)",
          border: 0,
        }}
      />
      <label
        htmlFor={id}
        style={{
          display: "inline-flex",
          alignItems: "center",
          height: 40,
          padding: "0 16px",
          background: "var(--ds-bg-white)",
          border: `1px solid ${hasError ? "var(--ds-error)" : "var(--ds-border-str)"}`,
          borderRadius: "var(--ds-r-md)",
          fontFamily: "var(--ds-font-body)",
          fontSize: 13,
          fontWeight: 600,
          color: "var(--ds-text)",
          cursor: "pointer",
        }}
      >
        {buttonLabel}
      </label>
      {file ? (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontFamily: "var(--ds-font-body)",
            fontSize: 13,
            color: "var(--ds-text-sec)",
          }}
        >
          {file.name} · {formatSize(file.size)}
          <button
            type="button"
            aria-label={`Убрать файл ${file.name}`}
            onClick={() => {
              onChange(null);
              if (inputRef.current) inputRef.current.value = "";
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 22,
              height: 22,
              borderRadius: "50%",
              border: "none",
              background: "var(--ds-border)",
              color: "var(--ds-text-sec)",
              cursor: "pointer",
            }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </span>
      ) : (
        <span style={{ fontFamily: "var(--ds-font-body)", fontSize: 13, color: "var(--ds-text-muted)" }}>Файл не выбран</span>
      )}
    </div>
  );
}
