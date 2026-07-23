"use client";

/* ────────────────────────────────────────────────────────────────────────
   BidForm.tsx — форма отклика исполнителя (цена, срок, комментарий).
   Карточка в сайдбаре страницы заявки (перенесено из BidModal.tsx —
   модалка не подошла по UX, отклик теперь со страницы заявки).
   ──────────────────────────────────────────────────────────────────────── */

import { useState } from "react";
import type { FormEvent } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { useRouter as useI18nRouter } from "@/i18n/navigation";
import { AuthRequiredError } from "@/lib/api/client";
import { createBid } from "@/lib/api/marketplace";
import type { Bid } from "@/lib/api/marketplace";
import { ApiError } from "@/lib/api/types";

export interface BidFormProps {
  requestId: number;
  isVerified: boolean;
  onSuccess: (bid: Bid) => void;
}

export function BidForm({ requestId, isVerified, onSuccess }: BidFormProps) {
  const i18nRouter = useI18nRouter();

  const [price, setPrice] = useState("");
  const [deadlineDays, setDeadlineDays] = useState("");
  const [comment, setComment] = useState("");
  const [touched, setTouched] = useState<{ price?: boolean; deadlineDays?: boolean }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string> | null>(null);

  const priceNumber = Number(price.replace(",", "."));
  const priceError =
    touched.price && (!price || Number.isNaN(priceNumber) || priceNumber <= 0)
      ? "Укажите цену больше нуля."
      : fieldErrors?.price;

  const deadlineNumber = Number(deadlineDays);
  const deadlineError =
    touched.deadlineDays && (!deadlineDays || !Number.isInteger(deadlineNumber) || deadlineNumber <= 0)
      ? "Укажите срок в днях (целое число, больше нуля)."
      : fieldErrors?.deadline_days;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFieldErrors(null);
    setTouched({ price: true, deadlineDays: true });

    if (!price || Number.isNaN(priceNumber) || priceNumber <= 0) return;
    if (!deadlineDays || !Number.isInteger(deadlineNumber) || deadlineNumber <= 0) return;

    setIsSubmitting(true);
    try {
      const bid = await createBid(requestId, {
        price: priceNumber.toFixed(2),
        deadline_days: deadlineNumber,
        comment: comment.trim() || undefined,
      });
      onSuccess(bid);
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
        // email_not_verified (этап 3 блока 1.11) — тот же приём, что в
        // RequestForm.tsx: отсылка к баннеру наверху страницы, не дубль
        // кнопки «отправить повторно» внутри формы.
        setFormError(
          err.code === "email_not_verified"
            ? "Чтобы откликнуться, подтвердите почту — воспользуйтесь баннером вверху страницы."
            : err.message,
        );
      } else {
        setFormError("Не удалось отправить отклик. Попробуйте ещё раз.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      style={{
        padding: 24,
        background: "var(--ds-bg-white)",
        border: "1px solid var(--ds-border)",
        borderRadius: "var(--ds-r-lg)",
      }}
    >
      <h2
        style={{
          fontFamily: "var(--ds-font-heading)",
          fontSize: 18,
          fontWeight: 700,
          color: "var(--ds-text)",
          margin: "0 0 16px",
        }}
      >
        Отклик на заявку
      </h2>

      {!isVerified && (
        <div style={{ marginBottom: 18 }}>
          <Alert variant="info">
            Заказчик увидит статус вашей верификации вместе с откликом. Чтобы вызывать больше
            доверия и выделяться среди предложений — приложите сканы лицензии и аттестата в
            профиле.
          </Alert>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <FormField id="bid-price" label="Цена, ₸" required error={priceError}>
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            placeholder="150000"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, price: true }))}
          />
        </FormField>

        <FormField id="bid-deadline" label="Срок, дней" required error={deadlineError}>
          <Input
            type="number"
            inputMode="numeric"
            min="1"
            step="1"
            placeholder="14"
            value={deadlineDays}
            onChange={(e) => setDeadlineDays(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, deadlineDays: true }))}
          />
        </FormField>

        <FormField id="bid-comment" label="Комментарий (необязательно)">
          <Textarea
            rows={3}
            placeholder="Например: готов приступить сразу, есть опыт по аналогичным объектам…"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </FormField>

        {/* Ошибка отправки — у кнопки, не в начале формы (тот же приём, что
           в RequestForm.tsx): formError появляется только после попытки
           отправки, взгляд пользователя уже здесь. На узких/невысоких
           экранах верхнее размещение было так же вне видимости, как и на
           длинной форме заявки — общий механизм, чиним в обеих формах. */}
        {formError && <Alert variant="error">{formError}</Alert>}

        <Button type="submit" disabled={isSubmitting} style={{ marginTop: 4 }}>
          {isSubmitting ? "Отправка…" : "Отправить отклик"}
        </Button>
      </form>
    </div>
  );
}
