"use client";

/* ────────────────────────────────────────────────────────────────────────
   BidModal.tsx — форма отклика исполнителя (цена, срок, комментарий).
   Открывается из строки ленты (RequestRow), закрывается по успеху/Esc/
   клику по фону/крестику (все три — через Modal.tsx).
   ──────────────────────────────────────────────────────────────────────── */

import { useState } from "react";
import type { FormEvent } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { WorkTypeBadge } from "@/components/ui/RequestRow";
import { Textarea } from "@/components/ui/Textarea";
import { useRouter as useI18nRouter } from "@/i18n/navigation";
import { AuthRequiredError } from "@/lib/api/client";
import { createBid } from "@/lib/api/marketplace";
import type { Bid, FeedRequest } from "@/lib/api/marketplace";
import { ApiError } from "@/lib/api/types";

export interface BidModalProps {
  open: boolean;
  request: FeedRequest;
  isVerified: boolean;
  onClose: () => void;
  onSuccess: (bid: Bid) => void;
}

export function BidModal({ open, request, isVerified, onClose, onSuccess }: BidModalProps) {
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

  function resetAndClose() {
    setPrice("");
    setDeadlineDays("");
    setComment("");
    setTouched({});
    setFormError(null);
    setFieldErrors(null);
    onClose();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFieldErrors(null);
    setTouched({ price: true, deadlineDays: true });

    if (!price || Number.isNaN(priceNumber) || priceNumber <= 0) return;
    if (!deadlineDays || !Number.isInteger(deadlineNumber) || deadlineNumber <= 0) return;

    setIsSubmitting(true);
    try {
      const bid = await createBid(request.id, {
        price: priceNumber.toFixed(2),
        deadline_days: deadlineNumber,
        comment: comment.trim() || undefined,
      });
      onSuccess(bid);
      resetAndClose();
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
        setFormError("Не удалось отправить отклик. Попробуйте ещё раз.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={resetAndClose} title="Отклик на заявку">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <WorkTypeBadge workType={request.work_type} />
        <span style={{ fontFamily: "var(--ds-font-body)", fontSize: 13, color: "var(--ds-text-sec)" }}>
          {request.location_display}
        </span>
      </div>

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
        {formError && <Alert variant="error">{formError}</Alert>}

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

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
          <Button type="button" variant="outline" onClick={resetAndClose} disabled={isSubmitting}>
            Отмена
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Отправка…" : "Отправить отклик"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
