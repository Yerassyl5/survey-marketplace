"use client";

/* ────────────────────────────────────────────────────────────────────────
   ResultThread.tsx — лента результата (сдал/вернул/принял), общий read-only
   компонент для обеих ролей (ResultSubmissionCard у исполнителя,
   ResultReviewCard у заказчика). Хронология сверху вниз (старое → новое,
   Meta.ordering = created_at на бэкенде, компонент порядок не меняет) —
   причинность «сдал → вернули» читается как ответ на предыдущую запись,
   задом наперёд было бы противоестественно.

   Различение сторон — БЕЗ пузырей/аватаров/лево-право (это лог сделки, не
   мессенджер): роль читается словом в заголовке записи + цветом kind-пилюли,
   который и так 1:1 совпадает с ролью (submitted только у исполнителя,
   returned/accepted только у заказчика — гарантировано вьюхами на бэкенде,
   не совпадение). Второй параллельный код цвета «по роли» не заводим — два
   легенды цвета на одном экране путали бы, не помогали.

   Файлы — тот же FileLink, что уже используется в ТЗ/сданных файлах,
   сгруппированы под своей записью, у каждого — своё uploaded_at мелким
   шрифтом (при досдаче без возврата в одной записи могут быть файлы из
   разных загрузок — см. SubmitResultView, "открытое" submit-событие).
   ──────────────────────────────────────────────────────────────────────── */

import { FileLink } from "@/components/ui/FileLink";
import type { ResultEntry } from "@/lib/api/marketplace";

const KIND_TITLE: Record<ResultEntry["kind"], string> = {
  submitted: "Исполнитель сдал результат",
  returned: "Заказчик вернул на доработку",
  accepted: "Заказчик принял результат",
};

const KIND_PILL_LABEL: Record<ResultEntry["kind"], string> = {
  submitted: "Сдал",
  returned: "Вернул",
  accepted: "Принял",
};

const KIND_VARS: Record<ResultEntry["kind"], { bg: string; color: string }> = {
  submitted: { bg: "var(--ds-progress-bg)", color: "var(--ds-progress-text)" },
  returned: { bg: "var(--ds-select-bg)", color: "var(--ds-select-text)" },
  accepted: { bg: "var(--ds-success-bg)", color: "var(--ds-success)" },
};

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function ResultThread({ entries }: { entries: ResultEntry[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {entries.map((entry, i) => {
        const vars = KIND_VARS[entry.kind];
        const isLast = i === entries.length - 1;
        return (
          <div
            key={entry.id}
            style={{
              position: "relative",
              display: "grid",
              gridTemplateColumns: "28px 1fr",
              gap: 16,
              paddingBottom: isLast ? 0 : 20,
            }}
          >
            <div style={{ position: "relative", display: "flex", justifyContent: "center" }}>
              {!isLast && (
                <div
                  style={{
                    position: "absolute",
                    top: 26,
                    bottom: -20,
                    width: 2,
                    background: "var(--ds-border)",
                  }}
                />
              )}
              <div
                style={{
                  zIndex: 1,
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  marginTop: 4,
                  background: vars.color,
                  border: "2px solid var(--ds-bg-white)",
                  boxShadow: "0 0 0 1px var(--ds-border-str)",
                }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontFamily: "var(--ds-font-body)", fontSize: 13.5, fontWeight: 700, color: "var(--ds-text)" }}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "1px 9px",
                      borderRadius: "var(--ds-r-pill)",
                      fontSize: 10.5,
                      fontWeight: 700,
                      marginRight: 8,
                      background: vars.bg,
                      color: vars.color,
                    }}
                  >
                    {KIND_PILL_LABEL[entry.kind]}
                  </span>
                  {KIND_TITLE[entry.kind]}
                </span>
                <span style={{ fontFamily: "var(--ds-font-body)", fontSize: 12, color: "var(--ds-text-muted)", whiteSpace: "nowrap" }}>
                  {formatDateTime(entry.created_at)}
                </span>
              </div>

              {entry.text && (
                <p style={{ margin: 0, fontFamily: "var(--ds-font-body)", fontSize: 13.5, lineHeight: 1.55, color: "var(--ds-text-sec)", whiteSpace: "pre-wrap" }}>
                  {entry.text}
                </p>
              )}

              {entry.files.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 2 }}>
                  {entry.files.map((f) => (
                    <div key={f.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <FileLink href={f.file} name={f.original_name || `Файл #${f.id}`} />
                      <span style={{ fontFamily: "var(--ds-font-body)", fontSize: 11, color: "var(--ds-text-muted)", whiteSpace: "nowrap" }}>
                        {formatDateTime(f.uploaded_at)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
