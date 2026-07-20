"use client";

/* ────────────────────────────────────────────────────────────────────────
   /ru/requests/my-work — «Мои сделки», кабинет исполнителя. Заявки, которые
   исполнитель выиграл (GET /marketplace/my-awarded/, не пагинируется —
   тот же принцип, что и у /marketplace/my-bids/, см. RequestPagination
   в backend/views.py). Фильтр на бэкенде — Bid.status=selected, поэтому
   здесь (в отличие от «Моих откликов») Request.status легитимно виден —
   исполнитель тут структурно только победитель (architecture.md §4.3,
   раздел там называется «В работе и выполненные» — в UI это название не
   используется, экран называется «Мои сделки»).
   Гвард — тем же паттерном, что на /feed/(requests/my-bids: исполнитель
   здесь, заказчик редиректится на /feed.

   Фильтры — локация (city_id/district_id внутри BidRequestBrief) и статус
   заявки (CONTRACTOR_STATUS_LABELS). Данных мало (эндпоинт без пагинации,
   ≤десятков строк даже у самого активного исполнителя) — фильтрация
   клиентская, useMemo над уже загруженным массивом, без URL query-параметров.
   ──────────────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";

import { StatusBadge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/FormField";
import { LocationCascadeSelect } from "@/components/ui/LocationCascadeSelect";
import { Select } from "@/components/ui/Select";
import { formatDate, WORK_TYPE_LABELS } from "@/components/ui/RequestRow";
import { useAuth } from "@/contexts/AuthContext";
import { Link, useRouter as useI18nRouter } from "@/i18n/navigation";
import { AuthRequiredError } from "@/lib/api/client";
import { getLocations } from "@/lib/api/geo";
import type { GeoLocations } from "@/lib/api/geo";
import { getMyAwarded } from "@/lib/api/marketplace";
import type { MyAwardedBid } from "@/lib/api/marketplace";
import { ApiError } from "@/lib/api/types";

// Статус заявки для ИСПОЛНИТЕЛЯ-победителя — отдельный набор от STATUS_LABELS
// (RequestRow.tsx): те лейблы написаны с позиции заказчика-принимающего
// («примите работу») и дословно не подходят сдающей стороне. На деле набор
// отличается от STATUS_LABELS РОВНО одним лейблом (result_submitted) — там
// «Результат сдан, примите работу», здесь «Сдано, ожидает приемки»; open/
// under_review/awarded/accepted у обеих сторон читаются одинаково («Принято»
// для accepted звучало бы промежуточным состоянием, тогда как это конец
// цикла — то же слово «Закрыта», что у заказчика). Если статус заявки для
// исполнителя понадобится ещё где-то (не только на этом экране) — выносить
// в общий модуль рядом со STATUS_LABELS, а не дублировать словарь повторно
// в третьем месте.
const CONTRACTOR_STATUS_LABELS: Record<MyAwardedBid["request"]["status"], string> = {
  open: "Новая",
  under_review: "Ждёт рассмотрения",
  awarded: "В работе",
  result_submitted: "Сдано, ожидает приемки",
  accepted: "Закрыта",
};

// Фильтр статуса — только 3 реально достижимых значения на этом экране, не
// все 5 ключей CONTRACTOR_STATUS_LABELS. MyAwardedListView фильтрует
// Bid.status=SELECTED, что структурно гарантирует Request.status уже прошёл
// award (см. backend/apps/marketplace/serializers.py::BidRequestWithStatusSerializer)
// — open/under_review здесь никогда не встретятся, показывать их в фильтре
// как варианты выбора было бы нечестно (пустой результат гарантированно).
const STATUS_FILTER_OPTIONS: Array<MyAwardedBid["request"]["status"]> = [
  "awarded",
  "result_submitted",
  "accepted",
];

const COLUMNS = ["№", "Тип работ", "Локация", "Моя цена", "Мой срок", "Статус", "Дата отклика"];

function TableShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        overflowX: "auto",
        border: "1px solid var(--ds-border)",
        borderRadius: "var(--ds-r-lg)",
        background: "var(--ds-bg-white)",
      }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
        <thead>
          <tr>
            {COLUMNS.map((c) => (
              <th
                key={c}
                style={{
                  textAlign: "left",
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
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i}>
          <td style={td}><SkeletonBar width={18} /></td>
          <td style={td}><SkeletonBar width={90} /></td>
          <td style={td}><SkeletonBar width={100} /></td>
          <td style={td}><SkeletonBar width={80} /></td>
          <td style={td}><SkeletonBar width={60} /></td>
          <td style={td}><SkeletonBar width={100} /></td>
          <td style={td}><SkeletonBar width={110} /></td>
        </tr>
      ))}
    </>
  );
}

const cellStyle: CSSProperties = {
  padding: "14px 16px",
  fontFamily: "var(--ds-font-body)",
  fontSize: 13,
  color: "var(--ds-text)",
  borderBottom: "1px solid var(--ds-border)",
  verticalAlign: "middle",
};

/* ── Фильтры — локация (LocationCascadeSelect, тот же переиспользуемый
   компонент, что и на /feed) + статус заявки. Обёртка-бокс — тот же стиль,
   что FilterBar.tsx/LocationFilterBar в my-bids. ─────────────────────────── */
function FiltersBar({
  locations,
  cityId,
  districtId,
  onLocationChange,
  status,
  onStatusChange,
  hasActiveFilters,
  onReset,
  locationResetNonce,
}: {
  locations: GeoLocations | null;
  cityId: number | null;
  districtId: number | null;
  onLocationChange: (next: { cityId: number | null; districtId: number | null }) => void;
  status: MyAwardedBid["request"]["status"] | "";
  onStatusChange: (next: MyAwardedBid["request"]["status"] | "") => void;
  hasActiveFilters: boolean;
  onReset: () => void;
  locationResetNonce: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "flex-end",
        gap: 16,
        padding: 20,
        background: "var(--ds-bg-white)",
        border: "1px solid var(--ds-border)",
        borderRadius: "var(--ds-r-lg)",
      }}
    >
      <div style={{ minWidth: 200, flex: "1 1 200px" }}>
        <FormField id="my-work-filter-status" label="Статус">
          <Select
            value={status}
            onChange={(e) => onStatusChange(e.target.value as MyAwardedBid["request"]["status"] | "")}
          >
            <option value="">Все статусы</option>
            {STATUS_FILTER_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {CONTRACTOR_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </FormField>
      </div>

      <LocationCascadeSelect
        key={locationResetNonce}
        locations={locations}
        value={{ cityId, districtId }}
        onChange={onLocationChange}
        allowEmpty
        idPrefix="my-work-filter"
      />

      {hasActiveFilters && (
        <button
          type="button"
          onClick={onReset}
          style={{
            height: 40,
            padding: "0 16px",
            background: "transparent",
            border: "1px solid var(--ds-border-str)",
            borderRadius: "var(--ds-r-md)",
            fontFamily: "var(--ds-font-body)",
            fontSize: 13,
            fontWeight: 500,
            color: "var(--ds-text-sec)",
            cursor: "pointer",
            transition: "border-color 150ms, color 150ms",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--ds-blue)";
            e.currentTarget.style.color = "var(--ds-blue)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--ds-border-str)";
            e.currentTarget.style.color = "var(--ds-text-sec)";
          }}
        >
          Сбросить фильтры
        </button>
      )}
    </div>
  );
}

/* ── Пустые состояния — два разных: "no-data" (сделок нет вообще) и
   "no-results" (сделки есть, но фильтры отсекли все) — тот же принцип,
   что и на /feed и /requests/my-bids. ─────────────────────────────────── */
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
      <p style={{ fontFamily: "var(--ds-font-heading)", fontSize: 16, fontWeight: 700, color: "var(--ds-text)", margin: "0 0 6px" }}>
        {variant === "no-data" ? "Пока нет сделок" : "Ничего не найдено"}
      </p>
      <p style={{ fontFamily: "var(--ds-font-body)", fontSize: 14, color: "var(--ds-text-sec)", margin: "0 0 20px" }}>
        {variant === "no-data"
          ? "Здесь появятся заявки, в которых вас выбрали исполнителем."
          : "Попробуйте изменить или сбросить фильтры."}
      </p>
      {variant === "no-data" ? (
        <Link href="/feed">
          <Button type="button">Посмотреть открытые заявки</Button>
        </Link>
      ) : (
        <Button type="button" onClick={onReset}>
          Сбросить фильтры
        </Button>
      )}
    </div>
  );
}

export default function MyWorkPage() {
  const { user } = useAuth();
  const i18nRouter = useI18nRouter();

  const isContractor = user?.role === "contractor";

  useEffect(() => {
    if (user && user.role !== "contractor") {
      i18nRouter.replace("/feed");
    }
  }, [user, i18nRouter]);

  const [retryNonce, setRetryNonce] = useState(0);
  const [result, setResult] = useState<
    | { key: number; status: "success"; data: MyAwardedBid[] }
    | { key: number; status: "error"; message: string }
    | null
  >(null);
  const isLoading = isContractor && result?.key !== retryNonce;

  useEffect(() => {
    if (!isContractor) return;
    let cancelled = false;
    getMyAwarded()
      .then((data) => {
        if (cancelled) return;
        setResult({ key: retryNonce, status: "success", data });
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof AuthRequiredError) {
          i18nRouter.replace("/login");
          return;
        }
        setResult({
          key: retryNonce,
          status: "error",
          message: err instanceof ApiError ? err.message : "Не удалось загрузить сделки.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [isContractor, retryNonce, i18nRouter]);

  const [locations, setLocations] = useState<GeoLocations | null>(null);
  useEffect(() => {
    // Справочник — вспомогательные данные для фильтра, не критический путь:
    // если запрос упадёт, таблица всё равно работает, просто без фильтра.
    getLocations()
      .then(setLocations)
      .catch(() => {});
  }, []);

  const [cityId, setCityId] = useState<number | null>(null);
  const [districtId, setDistrictId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<MyAwardedBid["request"]["status"] | "">("");
  const hasActiveFilters = cityId != null || districtId != null || statusFilter !== "";

  // Форсированный remount LocationCascadeSelect при сбросе — иначе если
  // пользователь выбрал ОБЛАСТЬ, но не успел выбрать город/район внутри неё,
  // внешний value уже был {null, null} и до, и после сброса (регион без листа
  // наружу не передаётся), компонент не увидит изменения props и не очистит
  // свой внутренний pendingRegionId — второй select останется висеть на
  // старой области. key меняет identity инстанса, свежий mount пересчитывает
  // внутренний стейт с нуля из уже обнулённого value.
  const [locationResetNonce, setLocationResetNonce] = useState(0);

  function handleLocationChange(next: { cityId: number | null; districtId: number | null }) {
    setCityId(next.cityId);
    setDistrictId(next.districtId);
  }

  function handleReset() {
    setCityId(null);
    setDistrictId(null);
    setStatusFilter("");
    setLocationResetNonce((n) => n + 1);
  }

  const allBids = result?.status === "success" ? result.data : null;
  const filteredBids = useMemo(() => {
    if (!allBids) return null;
    if (!hasActiveFilters) return allBids;
    return allBids.filter((bid) => {
      if (statusFilter && bid.request.status !== statusFilter) return false;
      if (cityId != null && bid.request.city_id !== cityId) return false;
      if (districtId != null && bid.request.district_id !== districtId) return false;
      return true;
    });
  }, [allBids, cityId, districtId, statusFilter, hasActiveFilters]);

  if (!user || !isContractor) {
    return null;
  }

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
        <h1 style={{ fontFamily: "var(--ds-font-heading)", fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--ds-text)", margin: "0 0 6px" }}>
          Мои сделки
        </h1>
        <p style={{ fontFamily: "var(--ds-font-body)", fontSize: 14, color: "var(--ds-text-sec)", margin: 0 }}>
          Заявки, в которых вас выбрали исполнителем, и статус по каждой.
        </p>
      </div>

      {allBids && allBids.length > 0 && (
        <FiltersBar
          locations={locations}
          cityId={cityId}
          districtId={districtId}
          onLocationChange={handleLocationChange}
          status={statusFilter}
          onStatusChange={setStatusFilter}
          hasActiveFilters={hasActiveFilters}
          onReset={handleReset}
          locationResetNonce={locationResetNonce}
        />
      )}

      {isLoading ? (
        <TableShell>
          <SkeletonRows />
        </TableShell>
      ) : result?.status === "error" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
          <Alert variant="error">{result.message}</Alert>
          <Button type="button" onClick={() => setRetryNonce((n) => n + 1)}>
            Повторить
          </Button>
        </div>
      ) : allBids && allBids.length === 0 ? (
        <EmptyState variant="no-data" onReset={handleReset} />
      ) : filteredBids && filteredBids.length === 0 ? (
        <EmptyState variant="no-results" onReset={handleReset} />
      ) : filteredBids ? (
        <TableShell>
          {filteredBids.map((bid, i) => (
            <tr
              key={bid.id}
              onClick={() => i18nRouter.push(`/requests/${bid.request.id}`)}
              style={{ transition: "background 150ms", cursor: "pointer" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--ds-blue-xlight)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <td style={{ ...cellStyle, color: "var(--ds-text-muted)" }}>{i + 1}</td>
              <td style={cellStyle}>{WORK_TYPE_LABELS[bid.request.work_type]}</td>
              <td style={cellStyle}>{bid.request.location_display}</td>
              <td style={cellStyle}>{Number(bid.price).toLocaleString("ru-RU")} ₸</td>
              <td style={cellStyle}>{bid.deadline_days} дн.</td>
              <td style={cellStyle}>
                <StatusBadge status={CONTRACTOR_STATUS_LABELS[bid.request.status]} />
              </td>
              <td style={{ ...cellStyle, color: "var(--ds-text-sec)", whiteSpace: "nowrap" }}>{formatDate(bid.created_at)}</td>
            </tr>
          ))}
        </TableShell>
      ) : null}
    </div>
  );
}
