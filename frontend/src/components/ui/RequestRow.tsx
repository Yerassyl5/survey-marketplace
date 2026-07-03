"use client";

/* ────────────────────────────────────────────────────────────────────────
   RequestRow.tsx — строка таблицы ленты заявок + WorkTypeBadge.
   WorkTypeBadge нейтральный (один стиль на все 5 типов): тип работ — это
   категория, не состояние, цветовую семантику StatusBadge/VerificationBadge
   на него не переносим (design-system.md).
   ──────────────────────────────────────────────────────────────────────── */

import type { CSSProperties } from "react";

import type { FeedRequest, WorkType } from "@/lib/api/marketplace";

export const WORK_TYPE_LABELS: Record<WorkType, string> = {
  geodesy: "Геодезия",
  geology: "Геология",
  geophysics: "Геофизика",
  ecology: "Экология",
  other: "Прочее",
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

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(
    new Date(iso),
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

export function RequestRow({
  request,
  index,
  onRespond,
}: {
  request: FeedRequest;
  index: number;
  onRespond: (request: FeedRequest) => void;
}) {
  const customerLabel = request.customer.organization_name || request.customer.full_name;

  return (
    <tr
      style={{ transition: "background 150ms" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--ds-blue-xlight)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <td style={{ ...cellStyle, color: "var(--ds-text-muted)" }}>{index}</td>
      <td style={cellStyle}>
        <WorkTypeBadge workType={request.work_type} />
      </td>
      <td style={cellStyle}>{request.location_display}</td>
      <td style={{ ...cellStyle, color: "var(--ds-text-sec)" }}>{customerLabel}</td>
      <td style={{ ...cellStyle, color: "var(--ds-text-sec)", whiteSpace: "nowrap" }}>
        {formatDate(request.created_at)}
      </td>
      <td style={{ ...cellStyle, textAlign: "right" }}>
        {request.has_bid ? (
          <span
            title="Вы уже откликнулись на эту заявку"
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
          </span>
        ) : (
          <button
            type="button"
            onClick={() => onRespond(request)}
            style={{
              padding: "7px 16px",
              background: "var(--ds-blue)",
              border: "none",
              borderRadius: "var(--ds-r-md)",
              fontSize: 13,
              fontWeight: 600,
              fontFamily: "var(--ds-font-body)",
              color: "#FFFFFF",
              cursor: "pointer",
              transition: "background 150ms",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--ds-blue-dark)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "var(--ds-blue)")}
          >
            Откликнуться
          </button>
        )}
      </td>
    </tr>
  );
}
