"use client";

/* ────────────────────────────────────────────────────────────────────────
   /ru/requests/[id] — карточка заявки: описание, ТЗ, карта объекта
   (MapLibre). Исполнитель видит форму отклика в сайдбаре; заказчик —
   только просмотр (свою заявку — полностью, чужую — обезличенно, customer
   === null от бэкенда), без сайдбара (отклик не для его роли; полноценный
   обзор СВОЕЙ заявки заказчиком со списком откликов и award — следующий
   блок). Guard по роли — здесь же, тем же паттерном, что на /feed (не в
   общем (app)/layout.tsx): пускает и contractor, и customer.
   ──────────────────────────────────────────────────────────────────────── */

import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useParams } from "next/navigation";

import { Alert } from "@/components/ui/Alert";
import { formatDate, WORK_TYPE_LABELS, WorkTypeBadge } from "@/components/ui/RequestRow";
import { SiteMap } from "@/components/ui/SiteMap";
import { BidForm } from "@/components/marketplace/BidForm";
import { BidsPanel } from "@/components/marketplace/BidsPanel";
import { useAuth } from "@/contexts/AuthContext";
import { Link, useRouter as useI18nRouter } from "@/i18n/navigation";
import { AuthRequiredError } from "@/lib/api/client";
import { getRequestDetail } from "@/lib/api/marketplace";
import type { FeedRequestDetail } from "@/lib/api/marketplace";
import { ApiError } from "@/lib/api/types";

/* ── Карточка-обёртка (левая колонка) ─────────────────────────────────── */
function Card({ title, children }: { title: string; children: ReactNode }) {
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
          fontSize: 16,
          fontWeight: 700,
          color: "var(--ds-text)",
          margin: "0 0 12px",
        }}
      >
        {title}
      </h2>
      {children}
    </div>
  );
}

const backLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontFamily: "var(--ds-font-body)",
  fontSize: 13,
  fontWeight: 600,
  color: "var(--ds-blue)",
};

function BackToFeedLink() {
  return (
    <Link href="/feed" style={backLinkStyle}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="15 18 9 12 15 6" />
      </svg>
      Вернуться в ленту
    </Link>
  );
}

/* ── Состояния ─────────────────────────────────────────────────────────── */
function DetailSkeleton() {
  const bar = (w: number, h = 14): CSSProperties => ({
    width: w,
    height: h,
    borderRadius: 4,
    background: "var(--ds-border)",
    animation: "progeo-pulse 1.4s ease-in-out infinite",
  });
  const card: CSSProperties = {
    padding: 24,
    background: "var(--ds-bg-white)",
    border: "1px solid var(--ds-border)",
    borderRadius: "var(--ds-r-lg)",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={bar(220, 28)} />
        <div style={bar(320)} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
        <div style={{ flex: "2 1 480px", display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={card}>
            <div style={bar(140)} />
            <div style={bar(480)} />
            <div style={bar(420)} />
          </div>
          <div style={{ ...card, height: 320 }} />
        </div>
        <div style={{ flex: "1 1 320px" }}>
          <div style={{ ...card, height: 280 }} />
        </div>
      </div>
    </div>
  );
}

function NotFoundState() {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "72px 24px",
        background: "var(--ds-bg-white)",
        border: "1px solid var(--ds-border)",
        borderRadius: "var(--ds-r-lg)",
      }}
    >
      <p
        style={{
          fontFamily: "var(--ds-font-heading)",
          fontSize: 18,
          fontWeight: 700,
          color: "var(--ds-text)",
          margin: "0 0 8px",
        }}
      >
        Заявка не найдена
      </p>
      <p style={{ fontFamily: "var(--ds-font-body)", fontSize: 14, color: "var(--ds-text-sec)", margin: "0 0 20px" }}>
        Возможно, её уже закрыли, отдали другому исполнителю, или ссылка неверна.
      </p>
      <BackToFeedLink />
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
      <Alert variant="error">{message}</Alert>
      <button
        type="button"
        onClick={onRetry}
        style={{
          padding: "8px 18px",
          background: "var(--ds-blue)",
          border: "none",
          borderRadius: "var(--ds-r-md)",
          fontFamily: "var(--ds-font-body)",
          fontSize: 13,
          fontWeight: 600,
          color: "#FFFFFF",
          cursor: "pointer",
        }}
      >
        Повторить
      </button>
    </div>
  );
}

/* ── Содержимое заявки ────────────────────────────────────────────────── */
function RespondedBadge() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "16px 20px",
        background: "var(--ds-active-bg)",
        border: "1px solid var(--ds-border)",
        borderRadius: "var(--ds-r-lg)",
        color: "var(--ds-active-text)",
        fontFamily: "var(--ds-font-body)",
        fontSize: 14,
        fontWeight: 600,
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="20 6 9 17 4 12" />
      </svg>
      Вы откликнулись на эту заявку
    </div>
  );
}

function DetailContent({
  request,
  isVerified,
  onBidSuccess,
  showBidSidebar,
  onAwarded,
}: {
  request: FeedRequestDetail;
  isVerified: boolean;
  onBidSuccess: () => void;
  /** Сайдбар отклика — только для роли contractor; заказчик (свою или чужую
   * заявку) видит только просмотр, без формы отклика. */
  showBidSidebar: boolean;
  onAwarded: (contractorId: number) => void;
}) {
  // customer === null — обезличенная чужая заявка (заказчик листает общую ленту).
  const customerLabel = request.customer ? request.customer.organization_name || request.customer.full_name : "Заказчик";
  // "status" в ответе есть ТОЛЬКО у RequestSerializer — то есть только когда
  // заказчик смотрит СВОЮ заявку (см. комментарий у FeedRequestDetail в
  // marketplace.ts). У исполнителя и у заказчика в чужой заявке через
  // ?scope=feed этого поля нет вообще (инвариант №9) — отдельного признака
  // is_owner заводить не нужно.
  const isOwnerView = request.status !== undefined;
  // Уточняющая геометрия ЗАЯВКИ (необязательна) приоритетнее геометрии
  // объекта — так и задумано моделью (Request.geometry: "участок уже есть
  // на объекте (Site)", это поле только для уточнений). Оба поля теперь
  // optional (см. marketplace.ts) — ?? null нормализует undefined (поле
  // отсутствует у текущего сериализатора) к null (SiteMap ждёт Geometry | null,
  // не | undefined).
  const geometry = request.geometry ?? request.site_geometry ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <div style={{ marginBottom: 12 }}>
          <BackToFeedLink />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <WorkTypeBadge workType={request.work_type} />
          <span style={{ fontFamily: "var(--ds-font-body)", fontSize: 13, color: "var(--ds-text-muted)" }}>
            Заявка #{request.id}
          </span>
        </div>
        <h1
          style={{
            fontFamily: "var(--ds-font-heading)",
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: "var(--ds-text)",
            margin: "0 0 6px",
          }}
        >
          {WORK_TYPE_LABELS[request.work_type]} — {request.location_display}
        </h1>
        <p style={{ fontFamily: "var(--ds-font-body)", fontSize: 14, color: "var(--ds-text-sec)", margin: 0 }}>
          Заказчик: {customerLabel} · Опубликовано {formatDate(request.created_at)}
        </p>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" }}>
        <div style={{ flex: "2 1 480px", display: "flex", flexDirection: "column", gap: 24 }}>
          {request.contractor_note && (
            <Alert variant="warning">
              <div>
                <strong style={{ display: "block", marginBottom: 4 }}>Условия заказчика</strong>
                {request.contractor_note}
              </div>
            </Alert>
          )}

          <Card title="Описание">
            <p
              style={{
                fontFamily: "var(--ds-font-body)",
                fontSize: 14,
                lineHeight: 1.6,
                color: "var(--ds-text)",
                margin: 0,
                whiteSpace: "pre-wrap",
              }}
            >
              {request.description}
            </p>
          </Card>

          <Card title="Техническое задание">
            {request.tz_file ? (
              <a
                href={request.tz_file}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  fontFamily: "var(--ds-font-body)",
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--ds-blue)",
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Скачать ТЗ
              </a>
            ) : (
              <p style={{ fontFamily: "var(--ds-font-body)", fontSize: 14, color: "var(--ds-text-muted)", margin: 0 }}>
                Файл не приложен.
              </p>
            )}
          </Card>

          <Card title="Расположение объекта">
            <SiteMap geometry={geometry} />
          </Card>
        </div>

        {showBidSidebar && (
          <div style={{ flex: "1 1 320px" }}>
            {request.has_bid ? (
              <RespondedBadge />
            ) : (
              <BidForm requestId={request.id} isVerified={isVerified} onSuccess={onBidSuccess} />
            )}
          </div>
        )}
      </div>

      {isOwnerView && (
        <BidsPanel
          requestId={request.id}
          requestStatus={request.status!}
          bidsCount={request.bids_count ?? 0}
          onAwarded={onAwarded}
        />
      )}
    </div>
  );
}

/* ── Страница ──────────────────────────────────────────────────────────── */
export default function RequestDetailPage() {
  const { user } = useAuth();
  const i18nRouter = useI18nRouter();
  const params = useParams<{ id: string }>();
  const requestId = Number(params.id);

  const isContractor = user?.role === "contractor";
  const isCustomer = user?.role === "customer";
  const isAllowedRole = isContractor || isCustomer;

  useEffect(() => {
    if (user && !isAllowedRole) {
      i18nRouter.replace("/login");
    }
  }, [user, isAllowedRole, i18nRouter]);

  const [retryNonce, setRetryNonce] = useState(0);
  const requestKey = `${requestId}|${retryNonce}`;
  const [result, setResult] = useState<
    | { key: string; status: "success"; data: FeedRequestDetail }
    | { key: string; status: "not-found" }
    | { key: string; status: "error"; message: string }
    | null
  >(null);
  const isLoading = isAllowedRole && result?.key !== requestKey;

  useEffect(() => {
    if (!isAllowedRole) return;
    let cancelled = false;
    getRequestDetail(requestId)
      .then((data) => {
        if (cancelled) return;
        setResult({ key: requestKey, status: "success", data });
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof AuthRequiredError) {
          i18nRouter.replace("/login");
          return;
        }
        if (err instanceof ApiError && err.status === 404) {
          setResult({ key: requestKey, status: "not-found" });
          return;
        }
        setResult({
          key: requestKey,
          status: "error",
          message: err instanceof ApiError ? err.message : "Не удалось загрузить заявку.",
        });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- requestKey уже включает все зависимые значения
  }, [isAllowedRole, requestKey, i18nRouter]);

  function handleBidSuccess() {
    setResult((prev) =>
      prev && prev.status === "success" ? { ...prev, data: { ...prev.data, has_bid: true } } : prev,
    );
  }

  function handleAwarded(contractorId: number) {
    setResult((prev) =>
      prev && prev.status === "success"
        ? { ...prev, data: { ...prev.data, status: "awarded", assigned_contractor: contractorId } }
        : prev,
    );
  }

  if (!user || !isAllowedRole) {
    return null;
  }

  return (
    <div style={{ maxWidth: "var(--ds-max-w)", margin: "0 auto", padding: "40px var(--ds-pad)" }}>
      {isLoading ? (
        <DetailSkeleton />
      ) : result?.status === "not-found" ? (
        <NotFoundState />
      ) : result?.status === "error" ? (
        <ErrorState message={result.message} onRetry={() => setRetryNonce((n) => n + 1)} />
      ) : result?.status === "success" ? (
        <DetailContent
          request={result.data}
          isVerified={user.verification_status === "verified"}
          onBidSuccess={handleBidSuccess}
          showBidSidebar={isContractor}
          onAwarded={handleAwarded}
        />
      ) : null}
    </div>
  );
}
