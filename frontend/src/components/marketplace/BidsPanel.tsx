"use client";

/* ────────────────────────────────────────────────────────────────────────
   BidsPanel.tsx — отклики на заявку, видна только заказчику-владельцу
   (страница /requests/[id] решает это по признаку "status" in response,
   см. marketplace.ts). Рассмотрение отклика (раскрытие телефона) и выбор
   исполнителя — оба действия отсюда.
   ──────────────────────────────────────────────────────────────────────── */

import { useEffect, useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { VerificationBadge } from "@/components/ui/Badge";
import { formatDate } from "@/components/ui/RequestRow";
import { Link, useRouter as useI18nRouter } from "@/i18n/navigation";
import { AuthRequiredError } from "@/lib/api/client";
import { awardBid, considerBid, getBids } from "@/lib/api/marketplace";
import type { BidWithConsideration, ContractorRating, MyRequest } from "@/lib/api/marketplace";
import { ApiError } from "@/lib/api/types";

// Пока заявка не присвоена — рассмотрение и выбор ещё имеют смысл (совпадает
// с PRE_AWARD_STATUSES на бэкенде, backend/apps/marketplace/views.py).
const PRE_AWARD_STATUSES: MyRequest["status"][] = ["open", "under_review"];

export interface BidsPanelProps {
  requestId: number;
  requestStatus: MyRequest["status"];
  /** Из Request.bids_count — только для заголовка ДО прихода массива.
   * Как только bids загружен, заголовок пересчитывается по bids.length —
   * bidsCount и bids могут разойтись (гонка/устаревший ответ), единственный
   * источник истины на экране после загрузки — сам массив. */
  bidsCount: number;
  onAwarded?: (contractorId: number) => void;
}

function ConsiderationTag({ consideredAt }: { consideredAt: string | null }) {
  const style = {
    display: "inline-flex",
    alignItems: "center",
    padding: "2px 10px",
    borderRadius: "var(--ds-r-pill)",
    fontSize: 11,
    fontWeight: 600,
    fontFamily: "var(--ds-font-body)",
    whiteSpace: "nowrap" as const,
  };
  if (consideredAt) {
    return (
      <span style={{ ...style, background: "var(--ds-active-bg)", color: "var(--ds-active-text)" }}>
        Рассмотрен {formatDate(consideredAt)}
      </span>
    );
  }
  return (
    <span style={{ ...style, background: "var(--ds-done-bg)", color: "var(--ds-done-text)" }}>
      Ожидает рассмотрения
    </span>
  );
}

// null, если у исполнителя нет ни одного отзыва — тогда не рисуем ничего
// (ни звёзды, ни «нет отзывов»): отсутствие рейтинга не должно визуально
// читаться как плохой рейтинг, тот же принцип, что у BidOutcomeTag ниже.
function RatingBadge({ rating }: { rating: ContractorRating | null }) {
  if (!rating) return null;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 10px",
        borderRadius: "var(--ds-r-pill)",
        fontSize: 11,
        fontWeight: 600,
        fontFamily: "var(--ds-font-body)",
        whiteSpace: "nowrap",
        background: "var(--ds-ver-bg)",
        color: "var(--ds-ver-text)",
        border: "1px solid var(--ds-ver-border)",
      }}
    >
      ★ {rating.avg.toFixed(1)} ({rating.count})
    </span>
  );
}

function BidOutcomeTag({ status }: { status: BidWithConsideration["status"] }) {
  if (status === "selected") {
    return (
      <span
        style={{
          display: "inline-flex",
          padding: "2px 10px",
          borderRadius: "var(--ds-r-pill)",
          fontSize: 11,
          fontWeight: 600,
          fontFamily: "var(--ds-font-body)",
          background: "var(--ds-active-bg)",
          color: "var(--ds-active-text)",
        }}
      >
        Выбран
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span
        style={{
          display: "inline-flex",
          padding: "2px 10px",
          borderRadius: "var(--ds-r-pill)",
          fontSize: 11,
          fontWeight: 600,
          fontFamily: "var(--ds-font-body)",
          background: "var(--ds-done-bg)",
          color: "var(--ds-done-text)",
        }}
      >
        Не выбран
      </span>
    );
  }
  return null;
}

function BidCardSkeleton() {
  return (
    <div
      style={{
        padding: 20,
        background: "var(--ds-bg-white)",
        border: "1px solid var(--ds-border)",
        borderRadius: "var(--ds-r-lg)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ height: 16, width: 180, borderRadius: 4, background: "var(--ds-border)", animation: "progeo-pulse 1.4s ease-in-out infinite" }} />
      <div style={{ height: 14, width: 260, borderRadius: 4, background: "var(--ds-border)", animation: "progeo-pulse 1.4s ease-in-out infinite" }} />
    </div>
  );
}

export function BidsPanel({ requestId, requestStatus, bidsCount, onAwarded }: BidsPanelProps) {
  const i18nRouter = useI18nRouter();

  const [bids, setBids] = useState<BidWithConsideration[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  // Отдельная ошибка на конкретной карточке (рассмотреть) — не валит всю панель.
  const [considerErrors, setConsiderErrors] = useState<Record<number, string>>({});
  const [consideringId, setConsideringId] = useState<number | null>(null);

  const [confirmTarget, setConfirmTarget] = useState<BidWithConsideration | null>(null);
  const [isAwarding, setIsAwarding] = useState(false);
  const [awardError, setAwardError] = useState<string | null>(null);

  const canAct = PRE_AWARD_STATUSES.includes(requestStatus);

  useEffect(() => {
    let cancelled = false;
    setBids(null);
    setLoadError(null);
    getBids(requestId)
      .then((data) => {
        if (!cancelled) setBids(data);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof AuthRequiredError) {
          i18nRouter.replace("/login");
          return;
        }
        setLoadError(err instanceof ApiError ? err.message : "Не удалось загрузить отклики.");
      });
    return () => {
      cancelled = true;
    };
  }, [requestId, retryNonce, i18nRouter]);

  async function handleConsider(bidId: number) {
    setConsideringId(bidId);
    setConsiderErrors((prev) => {
      const next = { ...prev };
      delete next[bidId];
      return next;
    });
    try {
      const updated = await considerBid(bidId);
      setBids((prev) => (prev ? prev.map((b) => (b.id === bidId ? updated : b)) : prev));
    } catch (err) {
      if (err instanceof AuthRequiredError) {
        i18nRouter.replace("/login");
        return;
      }
      setConsiderErrors((prev) => ({
        ...prev,
        [bidId]: err instanceof ApiError ? err.message : "Не удалось рассмотреть отклик.",
      }));
    } finally {
      setConsideringId(null);
    }
  }

  async function handleAward() {
    if (!confirmTarget) return;
    setIsAwarding(true);
    setAwardError(null);
    try {
      await awardBid(requestId, confirmTarget.id);
      const awardedContractorId = confirmTarget.contractor.id;
      setBids((prev) =>
        prev
          ? prev.map((b) => ({
              ...b,
              status: b.id === confirmTarget.id ? "selected" : b.status === "pending" ? "rejected" : b.status,
            }))
          : prev,
      );
      setConfirmTarget(null);
      onAwarded?.(awardedContractorId);
    } catch (err) {
      if (err instanceof AuthRequiredError) {
        i18nRouter.replace("/login");
        return;
      }
      setAwardError(err instanceof ApiError ? err.message : "Не удалось выбрать исполнителя.");
    } finally {
      setIsAwarding(false);
    }
  }

  const headerCount = bids ? bids.length : bidsCount;
  const noneConsideredYet = canAct && !!bids && bids.length > 0 && bids.every((b) => !b.considered_at);

  return (
    <div
      style={{
        padding: 24,
        background: "var(--ds-bg-white)",
        border: "1px solid var(--ds-border)",
        borderRadius: "var(--ds-r-lg)",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <h2 style={{ fontFamily: "var(--ds-font-heading)", fontSize: 18, fontWeight: 700, color: "var(--ds-text)", margin: 0 }}>
        Отклики · {headerCount}
      </h2>

      {noneConsideredYet && (
        <Alert variant="info">
          Чтобы выбрать исполнителя, сначала рассмотрите отклик — откроется телефон для связи.
        </Alert>
      )}

      {bids === null ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <BidCardSkeleton />
          <BidCardSkeleton />
        </div>
      ) : loadError ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
          <Alert variant="error">{loadError}</Alert>
          <Button type="button" variant="outline" onClick={() => setRetryNonce((n) => n + 1)}>
            Повторить
          </Button>
        </div>
      ) : bids.length === 0 ? (
        <p style={{ fontFamily: "var(--ds-font-body)", fontSize: 14, color: "var(--ds-text-muted)", margin: 0 }}>
          Пока никто не откликнулся.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {bids.map((bid) => {
            const canShowConsider = canAct && !bid.considered_at;
            const canShowAward = canAct && !!bid.considered_at && bid.status === "pending";
            return (
              <div
                key={bid.id}
                style={{
                  padding: 20,
                  border: "1px solid var(--ds-border)",
                  borderRadius: "var(--ds-r-lg)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <Link
                      href={`/contractors/${bid.contractor.id}`}
                      style={{
                        fontFamily: "var(--ds-font-heading)",
                        fontSize: 15,
                        fontWeight: 700,
                        color: "var(--ds-text)",
                        textDecoration: "none",
                      }}
                    >
                      {bid.contractor.full_name}
                    </Link>
                    <VerificationBadge verified={bid.contractor.verification_status === "verified"} />
                    <RatingBadge rating={bid.contractor.rating} />
                    <ConsiderationTag consideredAt={bid.considered_at} />
                    <BidOutcomeTag status={bid.status} />
                  </div>
                  <span style={{ fontFamily: "var(--ds-font-body)", fontSize: 13, color: "var(--ds-text-sec)", whiteSpace: "nowrap" }}>
                    {formatDate(bid.created_at)}
                  </span>
                </div>

                <div style={{ display: "flex", gap: 20, flexWrap: "wrap", fontFamily: "var(--ds-font-body)", fontSize: 14, color: "var(--ds-text)" }}>
                  <span><strong>{Number(bid.price).toLocaleString("ru-RU")} ₸</strong></span>
                  <span>Срок: {bid.deadline_days} дн.</span>
                </div>

                {bid.comment && (
                  <p style={{ fontFamily: "var(--ds-font-body)", fontSize: 14, color: "var(--ds-text-sec)", margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                    {bid.comment}
                  </p>
                )}

                {bid.contractor_phone && (
                  <p style={{ fontFamily: "var(--ds-font-body)", fontSize: 14, color: "var(--ds-text)", margin: 0 }}>
                    Телефон:{" "}
                    <a href={`tel:${bid.contractor_phone}`} style={{ color: "var(--ds-blue)", fontWeight: 600, userSelect: "text" }}>
                      {bid.contractor_phone}
                    </a>
                  </p>
                )}

                {considerErrors[bid.id] && <Alert variant="error">{considerErrors[bid.id]}</Alert>}

                {(canShowConsider || canShowAward) && (
                  <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
                    {canShowConsider && (
                      <Button type="button" onClick={() => handleConsider(bid.id)} disabled={consideringId === bid.id}>
                        {consideringId === bid.id ? "Рассматриваем…" : "Рассмотреть"}
                      </Button>
                    )}
                    {canShowAward && (
                      <Button
                        type="button"
                        onClick={() => {
                          setAwardError(null);
                          setConfirmTarget(bid);
                        }}
                      >
                        Выбрать исполнителя
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={confirmTarget !== null}
        title={`Выбрать исполнителя ${confirmTarget?.contractor.full_name ?? ""}?`}
        description={
          confirmTarget && (
            <>
              Цена: {Number(confirmTarget.price).toLocaleString("ru-RU")} ₸, срок: {confirmTarget.deadline_days} дн.
              <br />
              Действие необратимо — остальные отклики на эту заявку будут отклонены.
            </>
          )
        }
        confirmLabel="Выбрать"
        cancelLabel="Отмена"
        isConfirming={isAwarding}
        error={awardError}
        onConfirm={handleAward}
        onCancel={() => {
          if (isAwarding) return;
          setConfirmTarget(null);
          setAwardError(null);
        }}
      />
    </div>
  );
}
