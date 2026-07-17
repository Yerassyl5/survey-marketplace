"use client";

/* ────────────────────────────────────────────────────────────────────────
   ResultFileList.tsx — список сданных файлов результата (иконка+имя+ссылка
   на файл, через FileLink). Вынесен из ResultSubmissionCard.tsx — тот же
   список нужен и здесь (исполнитель, свои сдачи), и в ResultReviewCard.tsx
   (заказчик, просмотр результата) — один источник разметки на оба места.
   ──────────────────────────────────────────────────────────────────────── */

import { FileLink } from "@/components/ui/FileLink";
import type { ResultFile } from "@/lib/api/marketplace";

export function ResultFileList({ files }: { files: ResultFile[] }) {
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
      {files.map((f) => (
        <li key={f.id}>
          <FileLink href={f.file} name={f.original_name || `Файл #${f.id}`} />
        </li>
      ))}
    </ul>
  );
}
