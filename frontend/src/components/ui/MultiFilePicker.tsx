"use client";

/* ────────────────────────────────────────────────────────────────────────
   MultiFilePicker.tsx — выбор НЕСКОЛЬКИХ файлов: кнопка + список выбранных
   (имя/размер/удаление по одному). Отдельный компонент, не расширение
   FilePicker.tsx: у FilePicker узкий контракт (file: File | null,
   onChange: (file) => void) с двумя существующими потребителями (tz_file
   заявки, геометрия объекта) — оба именно про «один файл или ничего».
   Раздувать его до file | file[] дало бы полиморфный API и сломало бы типы
   на этих вызовах. Здесь принципиально другая форма данных (files: File[]),
   поэтому — свой компонент с тем же визуальным языком (скрытый input +
   label-кнопка), а не общая абстракция ради трёх похожих строк.

   Лимит размера — MAX_RESULT_FILE_SIZE, ЧИСТО клиентский UX-лимит (не дать
   браузеру зависнуть на выборе гигабайтного файла молча). Бэкенд/прокси
   сейчас НЕ ограничивают размер тела запроса вообще (DATA_UPLOAD_MAX_MEMORY_SIZE
   не задан в settings.py, nginx в проекте нет) — техдолг, зафиксирован в
   docs/progress.md, не закрывается этим компонентом.
   ──────────────────────────────────────────────────────────────────────── */

import { useRef, useState } from "react";

export const MAX_RESULT_FILE_SIZE = 300 * 1024 * 1024; // 300 МБ

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

export interface MultiFilePickerProps {
  id: string;
  files: File[];
  onChange: (files: File[]) => void;
  buttonLabel?: string;
}

export function MultiFilePicker({ id, files, onChange, buttonLabel = "Добавить файлы" }: MultiFilePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rejected, setRejected] = useState<string[]>([]);

  function handleSelect(fileList: FileList | null) {
    if (!fileList) return;
    const accepted: File[] = [];
    const tooBig: string[] = [];
    for (const f of Array.from(fileList)) {
      if (f.size > MAX_RESULT_FILE_SIZE) {
        tooBig.push(f.name);
      } else {
        accepted.push(f);
      }
    }
    setRejected(tooBig);
    if (accepted.length) onChange([...files, ...accepted]);
    // Сбрасываем value, иначе повторный выбор ТОГО ЖЕ файла (после удаления
    // из списка) не вызовет onChange — браузер считает значение не изменившимся.
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleRemove(index: number) {
    onChange(files.filter((_, i) => i !== index));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <input
          ref={inputRef}
          id={id}
          type="file"
          multiple
          onChange={(e) => handleSelect(e.target.files)}
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
            border: "1px solid var(--ds-border-str)",
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
        {files.length === 0 && (
          <span style={{ fontFamily: "var(--ds-font-body)", fontSize: 13, color: "var(--ds-text-muted)" }}>
            Файлы не выбраны
          </span>
        )}
      </div>

      {files.length > 0 && (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          {files.map((f, i) => (
            <li
              key={`${f.name}-${f.size}-${i}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontFamily: "var(--ds-font-body)",
                fontSize: 13,
                color: "var(--ds-text-sec)",
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {f.name} · {formatSize(f.size)}
              </span>
              <button
                type="button"
                aria-label={`Убрать файл ${f.name}`}
                onClick={() => handleRemove(i)}
                style={{
                  flexShrink: 0,
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
            </li>
          ))}
        </ul>
      )}

      {rejected.length > 0 && (
        <p style={{ fontFamily: "var(--ds-font-body)", fontSize: 12, fontWeight: 500, color: "var(--ds-error)", margin: 0 }}>
          {rejected.length === 1
            ? `Файл «${rejected[0]}» превышает ${formatSize(MAX_RESULT_FILE_SIZE)} и не добавлен.`
            : `Файлы превышают ${formatSize(MAX_RESULT_FILE_SIZE)} и не добавлены: ${rejected.join(", ")}.`}
        </p>
      )}
    </div>
  );
}
