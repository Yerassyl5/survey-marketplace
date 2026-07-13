"use client";

/* ────────────────────────────────────────────────────────────────────────
   /ru/requests/my — «Мои заявки», кабинет заказчика (заменяет прежнюю
   заглушку /dashboard). Список СВОИХ заявок; строка кликабельна → страница
   заявки (/requests/{id}), там же теперь просмотр откликов и выбор
   исполнителя (award) — см. BidsPanel.
   Гвард — тем же паттерном, что на /feed: исполнитель редиректится на
   /feed (это экран заказчика).
   ──────────────────────────────────────────────────────────────────────── */

import { Suspense, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { StatusBadge } from "@/components/ui/Badge";
import { Pagination } from "@/components/ui/Pagination";
import { formatDate, STATUS_LABELS, WORK_TYPE_LABELS } from "@/components/ui/RequestRow";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { Link, useRouter as useI18nRouter } from "@/i18n/navigation";
import { AuthRequiredError } from "@/lib/api/client";
import { getMyRequests } from "@/lib/api/marketplace";
import type { MyRequestsResponse } from "@/lib/api/marketplace";
import { ApiError } from "@/lib/api/types";

const PAGE_SIZE = 20;
const COLUMNS = ["№", "Тип работ", "Локация", "Статус", "Отклики", "Опубликовано"];

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
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
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
          <td style={td}><SkeletonBar width={140} /></td>
          <td style={td}><SkeletonBar width={80} /></td>
          <td style={td}><SkeletonBar width={40} /></td>
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

function EmptyState() {
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
        Заявок пока нет
      </p>
      <p style={{ fontFamily: "var(--ds-font-body)", fontSize: 14, color: "var(--ds-text-sec)", margin: "0 0 20px" }}>
        Создайте первую заявку — исполнители увидят её в общей ленте.
      </p>
      <Link href="/requests/new">
        <Button type="button">Создать заявку</Button>
      </Link>
    </div>
  );
}

function MyRequestsContent() {
  const { user } = useAuth();
  const router = useRouter();
  const i18nRouter = useI18nRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const isCustomer = user?.role === "customer";

  useEffect(() => {
    if (user && user.role !== "customer") {
      i18nRouter.replace("/feed");
    }
  }, [user, i18nRouter]);

  const pageParam = searchParams.get("page");
  const page = pageParam ? Number(pageParam) : 1;

  const [retryNonce, setRetryNonce] = useState(0);
  const requestKey = `${page}|${retryNonce}`;
  const [result, setResult] = useState<
    | { key: string; status: "success"; data: MyRequestsResponse }
    | { key: string; status: "error"; message: string }
    | null
  >(null);
  const isLoading = isCustomer && result?.key !== requestKey;

  useEffect(() => {
    if (!isCustomer) return;
    let cancelled = false;
    getMyRequests(page)
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
          message: err instanceof ApiError ? err.message : "Не удалось загрузить заявки.",
        });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- requestKey уже включает все зависимые значения
  }, [isCustomer, requestKey, i18nRouter]);

  if (!user || !isCustomer) {
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 style={{ fontFamily: "var(--ds-font-heading)", fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--ds-text)", margin: "0 0 6px" }}>
            Мои заявки
          </h1>
          <p style={{ fontFamily: "var(--ds-font-body)", fontSize: 14, color: "var(--ds-text-sec)", margin: 0 }}>
            Заявки, которые вы разместили на платформе.
          </p>
        </div>
        <Link href="/requests/new">
          <Button type="button">Создать заявку</Button>
        </Link>
      </div>

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
      ) : successData && successData.count === 0 ? (
        <EmptyState />
      ) : successData ? (
        <>
          <TableShell>
            {successData.results.map((r, i) => (
              <tr
                key={r.id}
                onClick={() => i18nRouter.push(`/requests/${r.id}`)}
                style={{ transition: "background 150ms", cursor: "pointer" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--ds-blue-xlight)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <td style={{ ...cellStyle, color: "var(--ds-text-muted)" }}>{(page - 1) * PAGE_SIZE + i + 1}</td>
                <td style={cellStyle}>{WORK_TYPE_LABELS[r.work_type]}</td>
                <td style={cellStyle}>{r.location_display}</td>
                <td style={cellStyle}>
                  <StatusBadge status={STATUS_LABELS[r.status]} />
                </td>
                <td style={cellStyle}>{r.bids_count}</td>
                <td style={{ ...cellStyle, color: "var(--ds-text-sec)", whiteSpace: "nowrap" }}>{formatDate(r.created_at)}</td>
              </tr>
            ))}
          </TableShell>
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={(p) => {
              const params = new URLSearchParams();
              if (p > 1) params.set("page", String(p));
              const qs = params.toString();
              router.replace(`${pathname}${qs ? `?${qs}` : ""}`);
            }}
          />
        </>
      ) : null}
    </div>
  );
}

function MyRequestsFallback() {
  return (
    <div style={{ maxWidth: "var(--ds-max-w)", margin: "0 auto", padding: "40px var(--ds-pad)" }}>
      <TableShell>
        <SkeletonRows />
      </TableShell>
    </div>
  );
}

export default function MyRequestsPage() {
  return (
    <Suspense fallback={<MyRequestsFallback />}>
      <MyRequestsContent />
    </Suspense>
  );
}
