"use client";

/* ────────────────────────────────────────────────────────────────────────
   /ru/requests/my-bids — «Мои отклики», кабинет исполнителя. Все отклики
   текущего исполнителя на все заявки (GET /marketplace/my-bids/, не
   пагинируется — см. комментарий у RequestPagination в backend/views.py).
   Статус вычисляется на фронте из Bid.status/considered_at (BidOutcomeBadge),
   НЕ из Request.status — эта заявка исполнителю структурно не видна вне
   BidRequestBrief (инвариант №9).
   Гвард — тем же паттерном, что на /feed/(requests/my: исполнитель здесь,
   заказчик редиректится на /feed.
   ──────────────────────────────────────────────────────────────────────── */

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

import { BidOutcomeBadge } from "@/components/marketplace/BidOutcomeBadge";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/button";
import { DescriptionCell, formatDate, WORK_TYPE_LABELS } from "@/components/ui/RequestRow";
import { useAuth } from "@/contexts/AuthContext";
import { Link, useRouter as useI18nRouter } from "@/i18n/navigation";
import { AuthRequiredError } from "@/lib/api/client";
import { getMyBids } from "@/lib/api/marketplace";
import type { MyBid } from "@/lib/api/marketplace";
import { ApiError } from "@/lib/api/types";

const COLUMNS = ["№", "Тип работ", "Локация", "Описание", "Моя цена", "Мой срок", "Статус", "Дата отклика"];

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
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
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
          <td style={td}><SkeletonBar width={160} /></td>
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
        Вы ещё не откликались
      </p>
      <p style={{ fontFamily: "var(--ds-font-body)", fontSize: 14, color: "var(--ds-text-sec)", margin: "0 0 20px" }}>
        Посмотрите открытые заявки в общей ленте и откликнитесь на подходящую.
      </p>
      <Link href="/feed">
        <Button type="button">Посмотреть открытые заявки</Button>
      </Link>
    </div>
  );
}

export default function MyBidsPage() {
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
    | { key: number; status: "success"; data: MyBid[] }
    | { key: number; status: "error"; message: string }
    | null
  >(null);
  const isLoading = isContractor && result?.key !== retryNonce;

  useEffect(() => {
    if (!isContractor) return;
    let cancelled = false;
    getMyBids()
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
          message: err instanceof ApiError ? err.message : "Не удалось загрузить отклики.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [isContractor, retryNonce, i18nRouter]);

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
          Мои отклики
        </h1>
        <p style={{ fontFamily: "var(--ds-font-body)", fontSize: 14, color: "var(--ds-text-sec)", margin: 0 }}>
          Заявки, на которые вы откликнулись, и статус рассмотрения по каждой.
        </p>
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
      ) : result?.status === "success" && result.data.length === 0 ? (
        <EmptyState />
      ) : result?.status === "success" ? (
        <TableShell>
          {result.data.map((bid, i) => (
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
              <td style={cellStyle}>
                <DescriptionCell text={bid.request.description} />
              </td>
              <td style={cellStyle}>{Number(bid.price).toLocaleString("ru-RU")} ₸</td>
              <td style={cellStyle}>{bid.deadline_days} дн.</td>
              <td style={cellStyle}>
                <BidOutcomeBadge bid={bid} />
              </td>
              <td style={{ ...cellStyle, color: "var(--ds-text-sec)", whiteSpace: "nowrap" }}>{formatDate(bid.created_at)}</td>
            </tr>
          ))}
        </TableShell>
      ) : null}
    </div>
  );
}
