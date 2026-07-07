"use client";

/* ────────────────────────────────────────────────────────────────────────
   /ru/feed — лента открытых заявок для исполнителя.
   Фильтры (work_type/city_id/district_id) и страница — в query-параметрах
   URL (deep-linking). Заказчик пока редиректится на /requests/my (доступ
   заказчика к общей ленте — отдельный коммит): guard по роли живёт здесь,
   а не в общем (app)/layout.tsx (тот проверяет только «залогинен ли»,
   используется и другими ролями).
   ──────────────────────────────────────────────────────────────────────── */

import { Suspense, useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { FilterBar } from "@/components/ui/FilterBar";
import type { FeedFilterValue } from "@/components/ui/FilterBar";
import { Pagination } from "@/components/ui/Pagination";
import { RequestRow } from "@/components/ui/RequestRow";
import { Alert } from "@/components/ui/Alert";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter as useI18nRouter } from "@/i18n/navigation";
import { AuthRequiredError } from "@/lib/api/client";
import { getLocations } from "@/lib/api/geo";
import type { GeoLocations } from "@/lib/api/geo";
import { getFeed } from "@/lib/api/marketplace";
import type { FeedResponse } from "@/lib/api/marketplace";
import { ApiError } from "@/lib/api/types";

const PAGE_SIZE = 20;
const COLUMNS = ["№", "Тип работ", "Локация", "Заказчик", "Примечание", "Опубликовано", ""];

/* ── Табличная обёртка ─────────────────────────────────────────────────── */
function TableShell({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        overflowX: "auto",
        border: "1px solid var(--ds-border)",
        borderRadius: "var(--ds-r-lg)",
        background: "var(--ds-bg-white)",
      }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
        <thead>
          <tr>
            {COLUMNS.map((c) => (
              <th
                key={c || "actions"}
                style={{
                  textAlign: c === "" ? "right" : "left",
                  padding: "12px 16px",
                  fontFamily: "var(--ds-font-body)",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--ds-text-muted)",
                  borderBottom: "1px solid var(--ds-border)",
                  whiteSpace: "nowrap",
                }}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function SkeletonBar({ width }: { width: number }) {
  return (
    <div
      style={{
        height: 14,
        width,
        borderRadius: 4,
        background: "var(--ds-border)",
        animation: "progeo-pulse 1.4s ease-in-out infinite",
      }}
    />
  );
}

function SkeletonRows() {
  const td: CSSProperties = { padding: "14px 16px", borderBottom: "1px solid var(--ds-border)" };
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <tr key={i}>
          <td style={td}><SkeletonBar width={18} /></td>
          <td style={td}><SkeletonBar width={90} /></td>
          <td style={td}><SkeletonBar width={140} /></td>
          <td style={td}><SkeletonBar width={160} /></td>
          <td style={td}><SkeletonBar width={120} /></td>
          <td style={td}><SkeletonBar width={110} /></td>
          <td style={{ ...td, textAlign: "right" }}><SkeletonBar width={100} /></td>
        </tr>
      ))}
    </>
  );
}

/* ── Пустые состояния ──────────────────────────────────────────────────── */
function EmptyState({ variant, onReset }: { variant: "no-data" | "no-results"; onReset: () => void }) {
  return (
    <div
      style={{
        padding: "56px 24px",
        textAlign: "center",
        border: "1px solid var(--ds-border)",
        borderRadius: "var(--ds-r-lg)",
        background: "var(--ds-bg-white)",
      }}
    >
      <p
        style={{
          fontFamily: "var(--ds-font-heading)",
          fontSize: 16,
          fontWeight: 700,
          color: "var(--ds-text)",
          margin: "0 0 6px",
        }}
      >
        {variant === "no-data" ? "Заявок пока нет" : "Ничего не найдено по фильтрам"}
      </p>
      <p
        style={{
          fontFamily: "var(--ds-font-body)",
          fontSize: 14,
          color: "var(--ds-text-sec)",
          margin: variant === "no-results" ? "0 0 16px" : 0,
        }}
      >
        {variant === "no-data"
          ? "Как только заказчики опубликуют заявки, они появятся здесь."
          : "Попробуйте изменить или сбросить фильтры."}
      </p>
      {variant === "no-results" && (
        <button
          type="button"
          onClick={onReset}
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
          Сбросить фильтры
        </button>
      )}
    </div>
  );
}

/* ── Stat-tile ряд: число (акцентный синий) + двухстрочная подпись рядом,
   разделены тонкой вертикальной линией внутри одной карточки. ─────────── */
function StatItem({ value, lines }: { value: number; lines: [string, string] }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 24px" }}>
      <span
        style={{
          fontFamily: "var(--ds-font-heading)",
          fontSize: 28,
          fontWeight: 700,
          color: "var(--ds-blue)",
          lineHeight: 1,
        }}
      >
        {value.toLocaleString("ru-RU")}
      </span>
      <span
        style={{
          fontFamily: "var(--ds-font-body)",
          fontSize: 12,
          fontWeight: 600,
          color: "var(--ds-text-sec)",
          lineHeight: 1.3,
        }}
      >
        {lines[0]}
        <br />
        {lines[1]}
      </span>
    </div>
  );
}

function StatRow({ available, todayCount }: { available: number; todayCount: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        width: "fit-content",
        background: "var(--ds-bg-white)",
        border: "1px solid var(--ds-border)",
        borderRadius: "var(--ds-r-lg)",
      }}
    >
      <StatItem value={available} lines={["заявок", "доступно"]} />
      <div style={{ width: 1, background: "var(--ds-border)" }} />
      <StatItem value={todayCount} lines={["новых", "сегодня"]} />
    </div>
  );
}

/* ── Контент (использует useSearchParams — под Suspense) ──────────────── */
function FeedContent() {
  const { user } = useAuth();
  const router = useRouter();
  const i18nRouter = useI18nRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const isContractor = user?.role === "contractor";

  useEffect(() => {
    if (user && user.role !== "contractor") {
      i18nRouter.replace("/requests/my");
    }
  }, [user, i18nRouter]);

  const workType = searchParams.get("work_type") ?? "";
  const cityIdParam = searchParams.get("city_id");
  const districtIdParam = searchParams.get("district_id");
  const cityId = cityIdParam ? Number(cityIdParam) : null;
  const districtId = districtIdParam ? Number(districtIdParam) : null;
  const pageParam = searchParams.get("page");
  const page = pageParam ? Number(pageParam) : 1;
  const hasActiveFilters = Boolean(workType || cityId || districtId);

  const [locations, setLocations] = useState<GeoLocations | null>(null);
  useEffect(() => {
    // Справочник — вспомогательные данные для фильтра, не критический путь:
    // если запрос упадёт, лента всё равно работает, просто без каскада локации.
    getLocations()
      .then(setLocations)
      .catch(() => {});
  }, []);

  // Результат привязан к "ключу" запроса (фильтры+страница+нонс ретрая).
  // Пока result.key не совпадает с текущим requestKey — считаем это
  // загрузкой; это производное состояние, вычисляемое во время рендера,
  // а не setState внутри эффекта (react.dev: избегаем set-state-in-effect —
  // лишний цикл рендера ради значения, уже известного на момент коммита эффекта).
  const [retryNonce, setRetryNonce] = useState(0);
  const requestKey = `${workType}|${cityId}|${districtId}|${page}|${retryNonce}`;
  const [result, setResult] = useState<
    | { key: string; status: "success"; data: FeedResponse }
    | { key: string; status: "error"; message: string }
    | null
  >(null);
  const isLoading = isContractor && result?.key !== requestKey;

  useEffect(() => {
    if (!isContractor) return;
    let cancelled = false;
    getFeed({
      work_type: workType || undefined,
      city_id: cityId ?? undefined,
      district_id: districtId ?? undefined,
      page,
    })
      .then((res) => {
        if (cancelled) return;
        setResult({ key: requestKey, status: "success", data: res });
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof AuthRequiredError) {
          i18nRouter.replace("/login");
          return;
        }
        setResult({
          key: requestKey,
          status: "error",
          message: err instanceof ApiError ? err.message : "Не удалось загрузить ленту заявок.",
        });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- requestKey уже включает все зависимые значения
  }, [isContractor, requestKey, i18nRouter]);

  function updateQuery(patch: Partial<{ work_type: string; city_id: number | null; district_id: number | null; page: number }>) {
    const next = { work_type: workType, city_id: cityId, district_id: districtId, page, ...patch };
    const params = new URLSearchParams();
    if (next.work_type) params.set("work_type", next.work_type);
    if (next.city_id != null) params.set("city_id", String(next.city_id));
    if (next.district_id != null) params.set("district_id", String(next.district_id));
    if (next.page > 1) params.set("page", String(next.page));
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`);
  }

  function handleFilterChange(next: FeedFilterValue) {
    updateQuery({ work_type: next.workType, city_id: next.cityId, district_id: next.districtId, page: 1 });
  }

  function handleReset() {
    updateQuery({ work_type: "", city_id: null, district_id: null, page: 1 });
  }

  if (!user || !isContractor) {
    // Заказчик — идёт редирект в эффекте выше; здесь просто не мигаем контентом ленты.
    return null;
  }

  const successData = result?.status === "success" ? result.data : null;
  const totalPages = successData ? Math.max(1, Math.ceil(successData.count / PAGE_SIZE)) : 1;

  return (
    <div
      style={{
        maxWidth: "var(--ds-max-w)",
        margin: "0 auto",
        padding: "40px var(--ds-pad)",
        display: "flex",
        flexDirection: "column",
        gap: 24,
      }}
    >
      <div>
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
          Лента заявок
        </h1>
        <p style={{ fontFamily: "var(--ds-font-body)", fontSize: 14, color: "var(--ds-text-sec)", margin: 0 }}>
          Изыскания по всему Казахстану — выбирайте подходящие заявки и откликайтесь.
        </p>
      </div>

      {successData && <StatRow available={successData.count} todayCount={successData.today_count} />}

      <FilterBar
        locations={locations}
        value={{ workType, cityId, districtId }}
        onChange={handleFilterChange}
        hasActiveFilters={hasActiveFilters}
        onReset={handleReset}
      />

      {isLoading ? (
        <TableShell>
          <SkeletonRows />
        </TableShell>
      ) : result?.status === "error" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
          <Alert variant="error">{result.message}</Alert>
          <button
            type="button"
            onClick={() => setRetryNonce((n) => n + 1)}
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
      ) : successData && successData.count === 0 ? (
        <EmptyState variant={hasActiveFilters ? "no-results" : "no-data"} onReset={handleReset} />
      ) : successData ? (
        <>
          <TableShell>
            {successData.results.map((r, i) => (
              <RequestRow key={r.id} request={r} index={(page - 1) * PAGE_SIZE + i + 1} />
            ))}
          </TableShell>
          <Pagination currentPage={page} totalPages={totalPages} onPageChange={(p) => updateQuery({ page: p })} />
        </>
      ) : null}
    </div>
  );
}

function FeedFallback() {
  return (
    <div style={{ maxWidth: "var(--ds-max-w)", margin: "0 auto", padding: "40px var(--ds-pad)" }}>
      <TableShell>
        <SkeletonRows />
      </TableShell>
    </div>
  );
}

export default function FeedPage() {
  return (
    <Suspense fallback={<FeedFallback />}>
      <FeedContent />
    </Suspense>
  );
}
