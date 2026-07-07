"use client";

/* ────────────────────────────────────────────────────────────────────────
   RequestRow.tsx — строка таблицы ленты заявок + WorkTypeBadge.
   WorkTypeBadge нейтральный (один стиль на все 5 типов): тип работ — это
   категория, не состояние, цветовую семантику StatusBadge/VerificationBadge
   на него не переносим (design-system.md).
   ──────────────────────────────────────────────────────────────────────── */

import type { CSSProperties } from "react";

import { Link, useRouter } from "@/i18n/navigation";
import type { RequestStatus as StatusLabel } from "@/components/ui/Badge";
import type { FeedRequest, MyRequest, WorkType } from "@/lib/api/marketplace";

export const WORK_TYPE_LABELS: Record<WorkType, string> = {
  geodesy: "Геодезия",
  geology: "Геология",
  geophysics: "Геофизика",
  ecology: "Экология",
  other: "Прочее",
};

/** marketplace.RequestStatus (backend) → метка StatusBadge. */
export const STATUS_LABELS: Record<MyRequest["status"], StatusLabel> = {
  open: "Новая",
  awarded: "В работе",
  result_submitted: "Результат сдан",
  accepted: "Принята",
};

export function WorkTypeBadge({ workType }: { workType: WorkType }) {
  const style: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    padding: "2px 10px",
    borderRadius: "var(--ds-r-pill)",
    fontSize: 12,
    fontWeight: 600,
    fontFamily: "var(--ds-font-body)",
    whiteSpace: "nowrap",
    lineHeight: 1.8,
    background: "var(--ds-blue-xlight)",
    color: "var(--ds-text-sec)",
  };
  return <span style={style}>{WORK_TYPE_LABELS[workType] ?? workType}</span>;
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(
    new Date(iso),
  );
}

const CONTRACTOR_NOTE_TRUNCATE_LENGTH = 45;

function truncateNote(note: string): string {
  return note.length <= CONTRACTOR_NOTE_TRUNCATE_LENGTH
    ? note
    : `${note.slice(0, CONTRACTOR_NOTE_TRUNCATE_LENGTH).trimEnd()}…`;
}

/** Примечание заказчика для исполнителей — видно сразу в ленте (не иконка/tooltip:
 * решение — текст должен читаться без наведения, важно и на мобильном). Полный
 * текст — на странице заявки; здесь обрезаем и даём title как подсказку с полным
 * текстом, если он не поместился. */
function ContractorNoteCell({ note }: { note: string }) {
  if (!note) {
    return <span style={{ color: "var(--ds-text-muted)" }}>—</span>;
  }
  return (
    <span
      title={note.length > CONTRACTOR_NOTE_TRUNCATE_LENGTH ? note : undefined}
      style={{
        display: "inline-block",
        maxWidth: 220,
        padding: "2px 8px",
        borderRadius: "var(--ds-r-sm)",
        background: "var(--ds-select-bg)",
        color: "var(--ds-select-text)",
        fontSize: 12,
        fontWeight: 600,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {truncateNote(note)}
    </span>
  );
}

const cellStyle: CSSProperties = {
  padding: "14px 16px",
  fontFamily: "var(--ds-font-body)",
  fontSize: 13,
  color: "var(--ds-text)",
  borderBottom: "1px solid var(--ds-border)",
  verticalAlign: "middle",
};

export function RequestRow({ request, index }: { request: FeedRequest; index: number }) {
  const router = useRouter();
  const customerLabel = request.customer.organization_name || request.customer.full_name;
  const href = `/requests/${request.id}`;

  return (
    <tr
      onClick={() => router.push(href)}
      style={{ transition: "background 150ms", cursor: "pointer" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--ds-blue-xlight)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <td style={{ ...cellStyle, color: "var(--ds-text-muted)" }}>{index}</td>
      <td style={cellStyle}>
        <WorkTypeBadge workType={request.work_type} />
      </td>
      <td style={cellStyle}>{request.location_display}</td>
      <td style={{ ...cellStyle, color: "var(--ds-text-sec)" }}>{customerLabel}</td>
      <td style={cellStyle}>
        <ContractorNoteCell note={request.contractor_note} />
      </td>
      <td style={{ ...cellStyle, color: "var(--ds-text-sec)", whiteSpace: "nowrap" }}>
        {formatDate(request.created_at)}
      </td>
      <td style={{ ...cellStyle, textAlign: "right" }}>
        {request.has_bid ? (
          <Link
            href={href}
            onClick={(e) => e.stopPropagation()}
            title="Вы уже откликнулись — открыть заявку"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 16px",
              background: "var(--ds-active-bg)",
              borderRadius: "var(--ds-r-md)",
              fontSize: 13,
              fontWeight: 600,
              fontFamily: "var(--ds-font-body)",
              color: "var(--ds-active-text)",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Вы откликнулись
          </Link>
        ) : (
          <Link
            href={href}
            onClick={(e) => e.stopPropagation()}
            style={{
              display: "inline-flex",
              padding: "7px 16px",
              background: "var(--ds-blue)",
              borderRadius: "var(--ds-r-md)",
              fontSize: 13,
              fontWeight: 600,
              fontFamily: "var(--ds-font-body)",
              color: "#FFFFFF",
              transition: "background 150ms",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--ds-blue-dark)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "var(--ds-blue)")}
          >
            Откликнуться
          </Link>
        )}
      </td>
    </tr>
  );
}
