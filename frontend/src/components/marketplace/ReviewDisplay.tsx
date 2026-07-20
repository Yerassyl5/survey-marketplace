"use client";

/* ────────────────────────────────────────────────────────────────────────
   ReviewDisplay.tsx — read-only вид отзыва. Чисто презентационный: знает
   только про review пропсом — ни requestId, ни роль/владение не нужны.
   Сделано так специально ради этапа 5 (репутация): тот же компонент
   встанет у исполнителя-победителя без единой правки, там своя обёртка
   сделает свой GET и передаст сюда тот же объект Review.
   ──────────────────────────────────────────────────────────────────────── */

import { formatDate } from "@/components/ui/RequestRow";
import type { Review } from "@/lib/api/reputation";

const FILLED_STAR = "★";
const EMPTY_STAR = "☆";

function StaticStars({ rating }: { rating: number }) {
  return (
    <span
      aria-label={`Оценка ${rating} из 5`}
      style={{ color: "var(--ds-select-text)", fontSize: 18, letterSpacing: 2, lineHeight: 1 }}
    >
      {Array.from({ length: 5 }, (_, i) => (i < rating ? FILLED_STAR : EMPTY_STAR)).join("")}
    </span>
  );
}

export interface ReviewDisplayProps {
  review: Review;
}

export function ReviewDisplay({ review }: ReviewDisplayProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <StaticStars rating={review.rating} />
        <span style={{ fontFamily: "var(--ds-font-body)", fontSize: 13, color: "var(--ds-text-sec)" }}>
          {formatDate(review.created_at)}
        </span>
      </div>

      {review.tags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {review.tags.map((tag) => (
            <span
              key={tag.id}
              style={{
                display: "inline-flex",
                padding: "2px 10px",
                borderRadius: "var(--ds-r-pill)",
                fontSize: 11,
                fontWeight: 600,
                fontFamily: "var(--ds-font-body)",
                background: "var(--ds-ver-bg)",
                color: "var(--ds-ver-text)",
                border: "1px solid var(--ds-ver-border)",
              }}
            >
              {tag.name}
            </span>
          ))}
        </div>
      )}

      {review.comment && (
        <p
          style={{
            fontFamily: "var(--ds-font-body)",
            fontSize: 14,
            color: "var(--ds-text)",
            margin: 0,
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
          }}
        >
          {review.comment}
        </p>
      )}
    </div>
  );
}
