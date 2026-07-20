"use client";

/* ────────────────────────────────────────────────────────────────────────
   /ru/requests/[id] — карточка заявки: описание, ТЗ, карта объекта
   (MapLibre). Сайдбар (320px) — «моё взаимодействие с заявкой», контент по
   роли: исполнитель без отклика — форма отклика; откликнувшийся — статус
   своего отклика; заказчик-владелец — краткая сводка откликов со ссылкой
   на полный список (BidsPanel, полной шириной ниже — карточки с ценой/
   сроком/телефоном там не помещаются в 320px, см. docs/progress.md);
   заказчик на чужой заявке через ленту — сайдбара нет вовсе. Победитель
   дополнительно видит карточку сдачи результата в ОСНОВНОЙ колонке
   (ResultSubmissionCard, не в сайдбаре — форма там тесна). Guard по роли —
   здесь же, тем же паттерном, что на /feed (не в общем (app)/layout.tsx):
   пускает и contractor, и customer.
   ──────────────────────────────────────────────────────────────────────── */

import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useParams } from "next/navigation";

import { Alert } from "@/components/ui/Alert";
import { FileLink } from "@/components/ui/FileLink";
import { formatDate, WORK_TYPE_LABELS, WorkTypeBadge } from "@/components/ui/RequestRow";
import { SiteMap } from "@/components/ui/SiteMap";
import { BidForm } from "@/components/marketplace/BidForm";
import { BidsPanel } from "@/components/marketplace/BidsPanel";
import { MyBidStatusPanel } from "@/components/marketplace/MyBidStatusPanel";
import { MyReviewCard } from "@/components/marketplace/MyReviewCard";
import { ResultReviewCard } from "@/components/marketplace/ResultReviewCard";
import { ReviewCard } from "@/components/marketplace/ReviewCard";
import { ResultSubmissionCard } from "@/components/marketplace/ResultSubmissionCard";
import { useAuth } from "@/contexts/AuthContext";
import { Link, useRouter as useI18nRouter } from "@/i18n/navigation";
import { AuthRequiredError } from "@/lib/api/client";
import { getRequestDetail } from "@/lib/api/marketplace";
import type { Bid, FeedRequestDetail } from "@/lib/api/marketplace";
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

/** tz_file — presigned MinIO URL, оригинальное имя файла на модели не хранится
 * (в отличие от ResultFile.original_name) — MinIO file_overwrite=True, поэтому
 * ключ в бакете почти всегда совпадает с очищенным оригинальным именем;
 * достаём basename до query-параметров подписи. null — если имя не
 * вытащилось (пустой basename, кривая %-последовательность и т.п.), тогда
 * вызывающая сторона подставляет плейсхолдер. */
function fileNameFromUrl(url: string): string | null {
  try {
    const path = url.split("?")[0];
    const last = path.split("/").pop() ?? "";
    const decoded = decodeURIComponent(last);
    return decoded || null;
  } catch {
    return null;
  }
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

/* ── Сайдбар заказчика-владельца — сводка + якорь на полный список
   BidsPanel ниже (раскладка «C»: сайдбар симметричен слотом с исполнителем,
   но сам список откликов с ценой/сроком/телефоном остаётся полной шириной —
   осознанное решение сессии, см. docs/progress.md). ─────────────────────── */
function BidsSummaryCard({ count }: { count: number }) {
  return (
    <div
      style={{
        padding: 24,
        background: "var(--ds-bg-white)",
        border: "1px solid var(--ds-border)",
        borderRadius: "var(--ds-r-lg)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <span style={{ fontFamily: "var(--ds-font-heading)", fontSize: 18, fontWeight: 700, color: "var(--ds-text)" }}>
        Откликов: {count}
      </span>
      <a
        href="#bids-panel"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontFamily: "var(--ds-font-body)",
          fontSize: 14,
          fontWeight: 600,
          color: "var(--ds-blue)",
        }}
      >
        Смотреть отклики
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="9 6 15 12 9 18" />
        </svg>
      </a>
    </div>
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
function DetailContent({
  request,
  isVerified,
  onBidSuccess,
  showBidSidebar,
  isCustomer,
  onAwarded,
  onWithdrawSuccess,
  onSubmitResultSuccess,
  onAcceptSuccess,
  onReturnSuccess,
}: {
  request: FeedRequestDetail;
  isVerified: boolean;
  onBidSuccess: (bid: Bid) => void;
  /** Сайдбар ОТКЛИКА (форма/статус) — только для роли contractor. Сайдбар
   * вообще — шире: у заказчика-владельца там своя сводка (BidsSummaryCard,
   * см. isOwnerView в JSX), у заказчика на чужой заявке через ленту —
   * сайдбара нет вовсе, как и раньше. */
  showBidSidebar: boolean;
  /** Роль текущего пользователя — явный проп, НЕ выводится из !showBidSidebar.
   * Нужен отдельно от showBidSidebar ради isOwnerView ниже. */
  isCustomer: boolean;
  onAwarded: (contractorId: number) => void;
  onWithdrawSuccess: () => void;
  onSubmitResultSuccess: () => void;
  onAcceptSuccess: () => void;
  onReturnSuccess: () => void;
}) {
  // customer === null — обезличенная чужая заявка (заказчик листает общую ленту).
  const customerLabel = request.customer ? request.customer.organization_name || request.customer.full_name : "Заказчик";
  // "status" в ответе теперь раскрывается ДВУМ разным ролям с РАЗНЫМ условием
  // на бэкенде: заказчику-владельцу (RequestSerializer) и исполнителю-
  // победителю (RequestFeedDetailSerializer.to_representation, условие
  // assigned_contractor_id === viewer.id — нужно для панели сдачи результата).
  // Поэтому одного "status" in response уже недостаточно, чтобы отличить
  // «это владелец, полный вид» — гейт по роли обязателен отдельно (баг,
  // найденный живой проверкой: без isCustomer победитель видел BidsPanel —
  // интерфейс заказчика, нарушение инварианта №9 по факту доступа к UI).
  const isOwnerView = isCustomer && request.status !== undefined;
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
              <div style={{ overflowWrap: "anywhere" }}>
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
                overflowWrap: "anywhere",
              }}
            >
              {request.description}
            </p>
          </Card>

          <Card title="Техническое задание">
            {request.tz_file ? (
              <FileLink href={request.tz_file} name={fileNameFromUrl(request.tz_file) ?? "Техническое задание"} />
            ) : (
              <p style={{ fontFamily: "var(--ds-font-body)", fontSize: 14, color: "var(--ds-text-muted)", margin: 0 }}>
                Файл не приложен.
              </p>
            )}
          </Card>

          <Card title="Расположение объекта">
            <SiteMap geometry={geometry} />
          </Card>

          {/* Отклики — ВНУТРИ левой колонки (та же ширина, что у Описание/ТЗ/
             Карты/Результата ниже), не отдельным полноширинным блоком: тот
             прежний вариант физически стоял ПОСЛЕ всего двухколоночного ряда
             и поэтому а) визуально оказывался НИЖЕ «Результата» (наоборот
             задуманному порядку) и б) был шире остальных карточек (не
             ограничен flex:"2 1 480px" этой колонки). Якорь #bids-panel —
             тот же, ссылка «Смотреть отклики» в BidsSummaryCard не менялась. */}
          {isOwnerView && (
            <div id="bids-panel">
              <BidsPanel
                requestId={request.id}
                requestStatus={request.status!}
                bidsCount={request.bids_count ?? 0}
                onAwarded={onAwarded}
              />
            </div>
          )}

          {/* Только для победителя (my_bid.status === "selected") — лента+форма
             сдачи, отдельная карточка от статус-панели сайдбара (замечание 1:
             MultiFilePicker тесен в 320px). НИЖЕ откликов — тот же порядок
             секций, что и у заказчика (см. ResultReviewCard ниже). */}
          {request.my_bid?.status === "selected" && request.status && (
            <ResultSubmissionCard
              requestId={request.id}
              requestStatus={request.status}
              resultEntries={request.result_entries ?? []}
              onSubmitResultSuccess={onSubmitResultSuccess}
            />
          )}

          {/* Отзыв заказчика (1.10) — только победителю, только на accepted.
             Проигравшему не показываем вообще: request.status ему структурно
             не приходит (см. docs/progress.md, план этапа 5), условие рендера
             построить не на чем, а остальной UI страницы для него и так нигде
             не раскрывает исход сделки. */}
          {request.my_bid?.status === "selected" && request.status === "accepted" && (
            <MyReviewCard requestId={request.id} />
          )}

          {/* Заказчик-владелец, симметрично ResultSubmissionCard выше — для всей
             заявки с назначенным исполнителем (awarded/result_submitted/accepted),
             не только "уже сдано": блок не должен исчезать после возврата, и на
             awarded без сдач заказчику нужно видеть, что работа началась.
             НИЖЕ Отклики — финальный порядок секций: Описание/ТЗ/Карта →
             Отклики → Результат. */}
          {isOwnerView && request.status && request.status !== "open" && request.status !== "under_review" && (
            <ResultReviewCard
              requestId={request.id}
              requestStatus={request.status}
              resultEntries={request.result_entries ?? []}
              onAcceptSuccess={onAcceptSuccess}
              onReturnSuccess={onReturnSuccess}
            />
          )}

          {/* Отзыв (1.10) — только после accepted (гейт на бэкенде тот же,
             но рендер условием ниже не даёт ReviewCard даже смонтироваться
             раньше: её собственный GET .../review/ иначе улетал бы на
             каждое открытие любой заявки в статусах до accepted). */}
          {isOwnerView && request.status === "accepted" && (
            <ReviewCard requestId={request.id} />
          )}
        </div>

        {(showBidSidebar || isOwnerView) && (
          <div style={{ flex: "1 1 320px" }}>
            {isOwnerView ? (
              <BidsSummaryCard count={request.bids_count ?? 0} />
            ) : request.my_bid ? (
              <MyBidStatusPanel bid={request.my_bid} requestStatus={request.status} onWithdrawSuccess={onWithdrawSuccess} />
            ) : (
              <BidForm requestId={request.id} isVerified={isVerified} onSuccess={onBidSuccess} />
            )}
          </div>
        )}
      </div>
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

  function handleBidSuccess(bid: Bid) {
    // createBid() (POST) не отдаёт considered_at — у свежесозданного отклика
    // оно всегда null, безопасно проставить явно. has_bid и my_bid обновляем
    // ВМЕСТЕ: has_bid — реальное поле API-контракта (не выдумка страницы),
    // если оставить его как было, локальный result.data разойдётся с тем,
    // что вернул бы свежий GET — тот же принцип, что и bidsCount/bids.length
    // в BidsPanel.
    setResult((prev) =>
      prev && prev.status === "success"
        ? {
            ...prev,
            data: {
              ...prev.data,
              has_bid: true,
              my_bid: {
                id: bid.id,
                price: bid.price,
                deadline_days: bid.deadline_days,
                comment: bid.comment,
                created_at: bid.created_at,
                status: bid.status,
                considered_at: null,
              },
            },
          }
        : prev,
    );
  }

  function handleWithdrawSuccess() {
    setResult((prev) =>
      prev && prev.status === "success"
        ? { ...prev, data: { ...prev.data, has_bid: false, my_bid: undefined } }
        : prev,
    );
  }

  function handleAwarded(contractorId: number) {
    setResult((prev) =>
      prev && prev.status === "success"
        ? { ...prev, data: { ...prev.data, status: "awarded", assigned_contractor: contractorId } }
        : prev,
    );
  }

  // Рефетч, не ручной мердж: submitResult()/acceptResult()/returnResult()
  // отдают только {status}, без id/URL новых ResultFile или самого
  // return_note — собирать их на клиенте значит рисковать разойтись с тем,
  // что реально сохранил сервер (тот же принцип, что и handleBidSuccess/
  // handleWithdrawSuccess выше, только там хватало данных из ответа, а
  // здесь — нет). Один обработчик на все три мутации — логика идентична.
  async function handleRequestChanged() {
    try {
      const data = await getRequestDetail(requestId);
      setResult({ key: requestKey, status: "success", data });
    } catch (err) {
      if (err instanceof AuthRequiredError) {
        i18nRouter.replace("/login");
        return;
      }
      // Мутация уже прошла на бэкенде — рефетч лишь обновляет вид страницы;
      // если он не удался (например, сеть моргнула сразу после успешного
      // POST), молча оставляем прежние данные до следующего F5/повтора.
    }
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
          isCustomer={isCustomer}
          onAwarded={handleAwarded}
          onWithdrawSuccess={handleWithdrawSuccess}
          onSubmitResultSuccess={handleRequestChanged}
          onAcceptSuccess={handleRequestChanged}
          onReturnSuccess={handleRequestChanged}
        />
      ) : null}
    </div>
  );
}
