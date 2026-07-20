"use client";

/* ────────────────────────────────────────────────────────────────────────
   MyReviewCard.tsx — отзыв заказчика ГЛАЗАМИ ПОБЕДИТЕЛЯ, /requests/[id],
   сразу после ResultSubmissionCard (see page.tsx). Только чтение — у
   исполнителя нет формы, отзыв создаёт исключительно заказчик-владелец
   (ReviewCard). Переиспользует ReviewDisplay без единой правки (задел
   этапа 4).

   Проигравшему эта карточка не показывается вообще (см. docs/progress.md,
   план этапа 5) — request.status ему структурно не приходит, условие
   рендера построить не на чем, а остальной UI страницы для него уже нигде
   не раскрывает исход сделки — отзыв не должен быть единственным
   исключением.

   review === null (отзыва нет) — рендерим НИЧЕГО, не текст-заглушку:
   отзыв полностью опционален (PRODUCT_SPEC 1.10, инвариант №8), «нет
   отзыва» может быть постоянным состоянием, а не «ещё не оставили» — тот
   же принцип, что у RatingBadge на этапе 3 (отсутствие не должно выглядеть
   как факт).
   ──────────────────────────────────────────────────────────────────────── */

import { useEffect, useState } from "react";

import { ReviewDisplay } from "@/components/marketplace/ReviewDisplay";
import { useRouter as useI18nRouter } from "@/i18n/navigation";
import { AuthRequiredError } from "@/lib/api/client";
import { getReview } from "@/lib/api/reputation";
import type { Review } from "@/lib/api/reputation";
import { ApiError } from "@/lib/api/types";

const cardStyle = {
  padding: 24,
  background: "var(--ds-bg-white)",
  border: "1px solid var(--ds-border)",
  borderRadius: "var(--ds-r-lg)",
} as const;

const titleStyle = {
  fontFamily: "var(--ds-font-heading)",
  fontSize: 16,
  fontWeight: 700,
  color: "var(--ds-text)",
  margin: "0 0 12px",
} as const;

export interface MyReviewCardProps {
  requestId: number;
}

export function MyReviewCard({ requestId }: MyReviewCardProps) {
  const i18nRouter = useI18nRouter();
  const [review, setReview] = useState<Review | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    getReview(requestId)
      .then((data) => {
        if (!cancelled) setReview(data);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof AuthRequiredError) {
          i18nRouter.replace("/login");
          return;
        }
        if (err instanceof ApiError && err.status === 404) {
          setReview(null);
          return;
        }
        // Прочие ошибки (сеть/5xx) — молча, тот же принцип, что getLocations():
        // блок необязательный, не должен занимать место сообщением об ошибке.
      });
    return () => {
      cancelled = true;
    };
  }, [requestId, i18nRouter]);

  // undefined (ещё грузится) и null (отзыва нет) — оба не рендерят ничего.
  if (!review) return null;

  return (
    <div style={cardStyle}>
      <h2 style={titleStyle}>Отзыв заказчика</h2>
      <ReviewDisplay review={review} />
    </div>
  );
}
