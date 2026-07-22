"use client";

/* ────────────────────────────────────────────────────────────────────────
   /ru/contractors/[id] — публичная карточка исполнителя (этап 5 «Профиля»),
   видна любому залогиненному (обе роли). Показывает: имя, статус
   верификации (только "verified" — см. VerificationStatusBadge ниже),
   рейтинг, «О себе», список отзывов.

   isOwn = user.role === "contractor" && user.id === contractorId. ВАЖНО:
   условие требует роль contractor, не только совпадение id — если заказчик
   наберёт /contractors/{свой id} вручную, это НЕ его карточка (у заказчиков
   карточек нет), должен получиться обычный 404 от публичного эндпоинта
   (тот фильтрует role=CONTRACTOR), а не "своя" ветка с пустым профилем.

   Свой профиль грузится ЦЕЛИКОМ через getProfile() (ProfileResponse,
   /accounts/profile/), НЕ через публичный getContractorPublic() — это даёт
   один и тот же тип данных, который PortfolioSection уже умеет редактировать
   (см. разведку этапа 5, вопрос 3), без второго типа и без мерджа. Чужой
   профиль — getContractorPublic() (ContractorPublicResponse), read-only.

   Личность и отзывы — ДВА независимых запроса (accounts + reputation, разные
   модули), с раздельными состояниями ошибки: без личности карточку показать
   нечего (полноэкранная ошибка/404), без отзывов — страница всё ещё
   осмысленна (ошибка/повтор только внутри блока отзывов, тот же принцип, что
   у BidsPanel на /requests/[id]).
   ──────────────────────────────────────────────────────────────────────── */

import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useParams } from "next/navigation";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/button";
import { PortfolioSection } from "@/components/accounts/PortfolioSection";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter as useI18nRouter } from "@/i18n/navigation";
import { AuthRequiredError } from "@/lib/api/client";
import { getContractorPublic, getProfile } from "@/lib/api/auth";
import type { ContractorPublicResponse, ProfileResponse } from "@/lib/api/types";
import { ApiError } from "@/lib/api/types";
import { getContractorReviews } from "@/lib/api/reputation";
import type { ContractorRatingSummary, ContractorReviewsResponse } from "@/lib/api/reputation";
import { ReviewDisplay } from "@/components/marketplace/ReviewDisplay";

/* ── Карточка-обёртка (тот же визуальный язык, что Card в /requests/[id] и
   Section в /ru/settings — своя локальная копия, не общий импорт: разные
   файлы, тот же принцип "дублировать проще, чем выносить ради второго
   потребителя", уже принятый в проекте). ─────────────────────────────────── */
function Card({ title, children }: { title?: string; children: ReactNode }) {
  const style: CSSProperties = {
    padding: 24,
    background: "var(--ds-bg-white)",
    border: "1px solid var(--ds-border)",
    borderRadius: "var(--ds-r-lg)",
    display: "flex",
    flexDirection: "column",
    gap: 16,
  };
  return (
    <div style={style}>
      {title && (
        <h2 style={{ fontFamily: "var(--ds-font-heading)", fontSize: 16, fontWeight: 700, color: "var(--ds-text)", margin: 0 }}>
          {title}
        </h2>
      )}
      {children}
    </div>
  );
}

/* ── Бейдж верификации — ТОЛЬКО для verified. Для pending/rejected/
   not_submitted — ничего не рендерим (не "Не верифицирован" одним словом на
   все три): это чужая карточка, посторонним не нужны детали чужого статуса
   верификации, а показывать одинаковый "негатив" для трёх разных по смыслу
   состояний — вводит в заблуждение (см. решение пользователя, этап 5). ──── */
function VerificationStatusBadge({ status }: { status: string | null }) {
  if (status !== "verified") return null;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 10px",
        borderRadius: "var(--ds-r-pill)",
        fontSize: 12,
        fontWeight: 600,
        fontFamily: "var(--ds-font-body)",
        background: "var(--ds-ver-bg)",
        color: "var(--ds-ver-text)",
        border: "1px solid var(--ds-ver-border)",
      }}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="20 6 9 17 4 12" />
      </svg>
      Верифицирован
    </span>
  );
}

/* ── Рейтинг — своя копия RatingBadge из BidsPanel.tsx (marketplace), не
   импорт: та функция локальна файлу и типизирована на ContractorRating из
   modules/marketplace — карточка исполнителя не должна тянуть чужой модуль
   ради тождественного по форме {avg,count} (см. разведку этапа 5, вопрос D).
   null — рейтинга нет ни одного отзыва — рендерим НИЧЕГО (не "0.0★"):
   отсутствие не должно читаться как факт, тот же принцип, что и у самого
   RatingBadge. ────────────────────────────────────────────────────────── */
function RatingBadge({ rating }: { rating: ContractorRatingSummary | null }) {
  if (!rating) return null;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 10px",
        borderRadius: "var(--ds-r-pill)",
        fontSize: 12,
        fontWeight: 600,
        fontFamily: "var(--ds-font-body)",
        background: "var(--ds-select-bg)",
        color: "var(--ds-select-text)",
      }}
    >
      ★ {rating.avg.toFixed(1)} ({rating.count})
    </span>
  );
}

/* ── «На платформе с {Месяц Год}» — тот же Intl.DateTimeFormat("ru-RU", ...),
   что уже используется в проекте (RequestRow.formatDate, ResultThread.
   formatDateTime), просто без day/hour/minute. Intl отдаёт месяц со строчной
   буквы ("июль 2026") — делаем первую букву заглавной вручную, без
   date-библиотек. ─────────────────────────────────────────────────────── */
function formatMemberSince(iso: string): string {
  const formatted = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(new Date(iso));
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

/* ── Состояния личности (accounts) ────────────────────────────────────── */
type IdentityState =
  | { status: "loading" }
  | { status: "not-found" }
  | { status: "error"; message: string }
  | { status: "success"; kind: "own"; profile: ProfileResponse }
  | { status: "success"; kind: "public"; profile: ContractorPublicResponse };

/* ── Состояния отзывов (reputation) — независимо от личности ──────────── */
type ReviewsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: ContractorReviewsResponse };

function IdentitySkeleton() {
  const bar = (w: number, h = 14): CSSProperties => ({
    width: w,
    height: h,
    borderRadius: 4,
    background: "var(--ds-border)",
    animation: "progeo-pulse 1.4s ease-in-out infinite",
  });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <Card>
        <div style={bar(220, 24)} />
        <div style={bar(320)} />
      </Card>
      <Card>
        <div style={bar(100)} />
        <div style={bar(280)} />
      </Card>
    </div>
  );
}

function NotFoundState() {
  return (
    <Card>
      <p style={{ fontFamily: "var(--ds-font-heading)", fontSize: 18, fontWeight: 700, color: "var(--ds-text)", margin: 0 }}>
        Исполнитель не найден
      </p>
      <p style={{ fontFamily: "var(--ds-font-body)", fontSize: 14, color: "var(--ds-text-sec)", margin: 0 }}>
        Возможно, ссылка неверна или аккаунт удалён.
      </p>
    </Card>
  );
}

/** Обёртка только для того, чтобы задать key={contractorId} — React сам
 * размонтирует/пересоздаст ContractorCard при переходе на другую карточку
 * (клиентская навигация между /contractors/1 → /contractors/2 иначе оставляла
 * бы тот же инстанс компонента, и без явного сброса state в эффекте на миг
 * показывались бы данные предыдущей карточки). Явный setState-в-начале-
 * эффекта (альтернативный способ сбросить state) не используется намеренно —
 * react-hooks/set-state-in-effect считает это анти-паттерном, remount через
 * key — рекомендуемая замена. */
export default function ContractorCardPage() {
  const params = useParams<{ id: string }>();
  const contractorId = Number(params.id);
  return <ContractorCard key={contractorId} contractorId={contractorId} />;
}

function ContractorCard({ contractorId }: { contractorId: number }) {
  const { user } = useAuth();
  const i18nRouter = useI18nRouter();

  const isOwn = !!user && user.role === "contractor" && user.id === contractorId;

  const [identity, setIdentity] = useState<IdentityState>({ status: "loading" });
  const [reviewsState, setReviewsState] = useState<ReviewsState>({ status: "loading" });
  const [reviewsRetryNonce, setReviewsRetryNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const request = isOwn ? getProfile() : getContractorPublic(contractorId);
    request
      .then((profile) => {
        if (cancelled) return;
        setIdentity(
          isOwn
            ? { status: "success", kind: "own", profile: profile as ProfileResponse }
            : { status: "success", kind: "public", profile: profile as ContractorPublicResponse },
        );
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof AuthRequiredError) {
          i18nRouter.replace("/login");
          return;
        }
        if (err instanceof ApiError && err.status === 404) {
          setIdentity({ status: "not-found" });
          return;
        }
        setIdentity({
          status: "error",
          message: err instanceof ApiError ? err.message : "Не удалось загрузить профиль.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [contractorId, isOwn, i18nRouter]);

  useEffect(() => {
    let cancelled = false;
    // Не сбрасываем в "loading" синхронно (react-hooks/set-state-in-effect,
    // тот же принцип, что и в identity-эффекте выше) — на повторный клик
    // "Повторить" предыдущая ошибка просто остаётся видна до ответа нового
    // запроса, не мигает в скелетон.
    getContractorReviews(contractorId)
      .then((data) => {
        if (!cancelled) setReviewsState({ status: "success", data });
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof AuthRequiredError) {
          i18nRouter.replace("/login");
          return;
        }
        setReviewsState({
          status: "error",
          message: err instanceof ApiError ? err.message : "Не удалось загрузить отзывы.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [contractorId, reviewsRetryNonce, i18nRouter]);

  if (identity.status === "loading") {
    return (
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "40px var(--ds-pad)" }}>
        <IdentitySkeleton />
      </div>
    );
  }
  if (identity.status === "not-found") {
    return (
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "40px var(--ds-pad)" }}>
        <NotFoundState />
      </div>
    );
  }
  if (identity.status === "error") {
    return (
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "40px var(--ds-pad)" }}>
        <Card>
          <Alert variant="error">{identity.message}</Alert>
        </Card>
      </div>
    );
  }

  const fullName = identity.profile.full_name;
  const verificationStatus = identity.profile.verification_status;
  const portfolioText = identity.profile.portfolio_description;
  const memberSince = identity.profile.date_joined;
  const completedCount = identity.profile.completed_requests_count;
  const rating = reviewsState.status === "success" ? reviewsState.data.rating : null;

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "40px var(--ds-pad)", display: "flex", flexDirection: "column", gap: 24 }}>
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h1 style={{ fontFamily: "var(--ds-font-heading)", fontSize: 22, fontWeight: 700, color: "var(--ds-text)", margin: 0 }}>
            {fullName}
          </h1>
          <VerificationStatusBadge status={verificationStatus} />
          <RatingBadge rating={rating} />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
          <span style={{ fontFamily: "var(--ds-font-body)", fontSize: 13, color: "var(--ds-text-sec)" }}>
            На платформе с {formatMemberSince(memberSince)}
          </span>
          <span style={{ fontFamily: "var(--ds-font-body)", fontSize: 13, color: "var(--ds-text-sec)" }}>
            Выполнено заявок: {completedCount}
          </span>
        </div>
      </Card>

      {identity.kind === "own" ? (
        <PortfolioSection
          profile={identity.profile}
          onSaved={(p) => setIdentity({ status: "success", kind: "own", profile: p })}
        />
      ) : (
        <Card title="О себе">
          {portfolioText && portfolioText.trim() ? (
            <p style={{ fontFamily: "var(--ds-font-body)", fontSize: 14, color: "var(--ds-text)", margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {portfolioText}
            </p>
          ) : (
            <p style={{ fontFamily: "var(--ds-font-body)", fontSize: 14, color: "var(--ds-text-muted)", margin: 0 }}>
              Исполнитель пока не заполнил раздел «О себе».
            </p>
          )}
        </Card>
      )}

      <Card title="Отзывы">
        {reviewsState.status === "loading" ? (
          <p style={{ fontFamily: "var(--ds-font-body)", fontSize: 14, color: "var(--ds-text-muted)", margin: 0 }}>
            Загрузка…
          </p>
        ) : reviewsState.status === "error" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
            <Alert variant="error">{reviewsState.message}</Alert>
            <Button type="button" variant="outline" onClick={() => setReviewsRetryNonce((n) => n + 1)}>
              Повторить
            </Button>
          </div>
        ) : reviewsState.data.reviews.length === 0 ? (
          <p style={{ fontFamily: "var(--ds-font-body)", fontSize: 14, color: "var(--ds-text-muted)", margin: 0 }}>
            Отзывов пока нет.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {reviewsState.data.reviews.map((review, i) => (
              <div
                key={review.id}
                style={{
                  paddingTop: i > 0 ? 20 : 0,
                  borderTop: i > 0 ? "1px solid var(--ds-border)" : undefined,
                }}
              >
                <ReviewDisplay review={review} />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
