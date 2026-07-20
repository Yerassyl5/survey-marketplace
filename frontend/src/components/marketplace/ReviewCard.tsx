"use client";

/* ────────────────────────────────────────────────────────────────────────
   ReviewCard.tsx — карточка отзыва в ОСНОВНОЙ колонке /requests/[id] у
   ЗАКАЗЧИКА-владельца, сразу под ResultReviewCard (см. page.tsx). Рендерится
   родителем ТОЛЬКО при request.status === "accepted" — свой GET уходит из
   useEffect здесь, но триггер по статусу живёт в page.tsx (компонента нет в
   дереве раньше accepted, значит useEffect не может выстрелить раньше).

   review: Review | null | undefined — три состояния:
   - undefined — идёт первый GET, ничего не рисуем;
   - null — GET вернул 404 (отзыва ещё нет) → форма;
   - Review — есть → ReviewDisplay (тот же компонент, что встанет у
     исполнителя-победителя на этапе 5).

   Теги (GET /tags/) — ЛЕНИВО: запрос уходит только когда review стал null
   (форма реально нужна), не параллельно с первым GET. Если отзыв уже есть,
   форма не рендерится вообще — справочник тегов не нужен, теги уже внутри
   самого review.
   ──────────────────────────────────────────────────────────────────────── */

import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/FormField";
import { Textarea } from "@/components/ui/Textarea";
import { ReviewDisplay } from "@/components/marketplace/ReviewDisplay";
import { useRouter as useI18nRouter } from "@/i18n/navigation";
import { AuthRequiredError } from "@/lib/api/client";
import { createReview, getReview, getReviewTags } from "@/lib/api/reputation";
import type { Review, ReviewTag } from "@/lib/api/reputation";
import { ApiError } from "@/lib/api/types";

const COMMENT_MAX_LENGTH = 2000;
const FILLED_STAR = "★";
const EMPTY_STAR = "☆";

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

function StarRatingInput({ value, onChange }: { value: number | null; onChange: (rating: number) => void }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const shown = hovered ?? value ?? 0;

  return (
    <div role="radiogroup" aria-label="Оценка от 1 до 5" style={{ display: "flex", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} из 5`}
          onClick={() => onChange(n)}
          onMouseEnter={() => setHovered(n)}
          onMouseLeave={() => setHovered(null)}
          onFocus={() => setHovered(n)}
          onBlur={() => setHovered(null)}
          style={{
            background: "none",
            border: "none",
            padding: 2,
            cursor: "pointer",
            fontSize: 26,
            lineHeight: 1,
            color: n <= shown ? "var(--ds-select-text)" : "var(--ds-border-str)",
          }}
        >
          {n <= shown ? FILLED_STAR : EMPTY_STAR}
        </button>
      ))}
    </div>
  );
}

function TagPicker({
  tags,
  selectedIds,
  onToggle,
}: {
  tags: ReviewTag[];
  selectedIds: number[];
  onToggle: (id: number) => void;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {tags.map((tag) => {
        const selected = selectedIds.includes(tag.id);
        return (
          <button
            key={tag.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onToggle(tag.id)}
            style={{
              display: "inline-flex",
              padding: "4px 12px",
              borderRadius: "var(--ds-r-pill)",
              fontSize: 12,
              fontWeight: 600,
              fontFamily: "var(--ds-font-body)",
              cursor: "pointer",
              background: selected ? "var(--ds-ver-bg)" : "var(--ds-bg-white)",
              color: selected ? "var(--ds-ver-text)" : "var(--ds-text-sec)",
              border: `1px solid ${selected ? "var(--ds-ver-border)" : "var(--ds-border-str)"}`,
            }}
          >
            {tag.name}
          </button>
        );
      })}
    </div>
  );
}

export interface ReviewCardProps {
  requestId: number;
}

export function ReviewCard({ requestId }: ReviewCardProps) {
  const i18nRouter = useI18nRouter();

  const [review, setReview] = useState<Review | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [tags, setTags] = useState<ReviewTag[] | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string> | null>(null);

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
        setLoadError(err instanceof ApiError ? err.message : "Не удалось загрузить отзыв.");
      });
    return () => {
      cancelled = true;
    };
  }, [requestId, i18nRouter]);

  // Ленивая подгрузка справочника — только когда форма реально понадобилась
  // (review подтверждённо null), не параллельно с первым GET выше.
  useEffect(() => {
    if (review !== null) return;
    getReviewTags()
      .then(setTags)
      .catch(() => {
        // Тот же принцип, что getLocations(): справочник не критичен для
        // рендера формы (рейтинг/комментарий работают без тегов), молча
        // оставляем пустой список — пилюли просто не появятся.
      });
  }, [review]);

  function toggleTag(id: number) {
    setSelectedTagIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!rating) return;
    setFormError(null);
    setFieldErrors(null);
    setIsSubmitting(true);
    try {
      const created = await createReview(requestId, {
        rating,
        comment: comment.trim() || undefined,
        tags: selectedTagIds,
      });
      setReview(created);
    } catch (err) {
      if (err instanceof AuthRequiredError) {
        i18nRouter.replace("/login");
        return;
      }
      if (err instanceof ApiError) {
        if (err.fieldErrors) {
          const flat: Record<string, string> = {};
          for (const [key, messages] of Object.entries(err.fieldErrors)) {
            flat[key] = messages[0];
          }
          setFieldErrors(flat);
        }
        setFormError(err.message);
      } else {
        setFormError("Не удалось отправить отзыв. Попробуйте ещё раз.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (review === undefined) {
    return loadError ? (
      <div style={cardStyle}>
        <Alert variant="error">{loadError}</Alert>
      </div>
    ) : null;
  }

  return (
    <div style={cardStyle}>
      <h2 style={titleStyle}>Отзыв</h2>

      {review ? (
        <ReviewDisplay review={review} />
      ) : (
        <form onSubmit={handleSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {formError && <Alert variant="error">{formError}</Alert>}

          <FormField id="review-rating" label="Оценка" required error={fieldErrors?.rating}>
            <StarRatingInput value={rating} onChange={setRating} />
          </FormField>

          {tags && tags.length > 0 && (
            <FormField id="review-tags" label="Что понравилось (необязательно)">
              <TagPicker tags={tags} selectedIds={selectedTagIds} onToggle={toggleTag} />
            </FormField>
          )}

          <FormField id="review-comment" label="Комментарий (необязательно)" error={fieldErrors?.comment}>
            <Textarea
              rows={3}
              maxLength={COMMENT_MAX_LENGTH}
              placeholder="Например: сроки, качество, коммуникация…"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </FormField>
          <p
            style={{
              fontFamily: "var(--ds-font-body)",
              fontSize: 12,
              color: "var(--ds-text-muted)",
              margin: "-10px 0 0",
              textAlign: "right",
            }}
          >
            {comment.length}/{COMMENT_MAX_LENGTH}
          </p>

          <Button type="submit" disabled={!rating || isSubmitting} style={{ marginTop: 4 }}>
            {isSubmitting ? "Отправка…" : "Оставить отзыв"}
          </Button>
        </form>
      )}
    </div>
  );
}
