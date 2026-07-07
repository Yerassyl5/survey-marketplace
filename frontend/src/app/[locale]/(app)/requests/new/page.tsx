"use client";

/* ────────────────────────────────────────────────────────────────────────
   /ru/requests/new — создание заявки заказчиком. Гвард по роли — тем же
   паттерном, что на /feed и /requests/[id]: исполнитель редиректится на
   /feed (форма создания — только для заказчика).
   ──────────────────────────────────────────────────────────────────────── */

import { useEffect } from "react";

import { RequestForm } from "@/components/marketplace/RequestForm";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter as useI18nRouter } from "@/i18n/navigation";

export default function NewRequestPage() {
  const { user } = useAuth();
  const i18nRouter = useI18nRouter();

  const isCustomer = user?.role === "customer";

  useEffect(() => {
    if (user && user.role !== "customer") {
      i18nRouter.replace("/feed");
    }
  }, [user, i18nRouter]);

  if (!user || !isCustomer) {
    return null;
  }

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px var(--ds-pad)" }}>
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
        Новая заявка
      </h1>
      <p style={{ fontFamily: "var(--ds-font-body)", fontSize: 14, color: "var(--ds-text-sec)", margin: "0 0 32px" }}>
        Опишите объём работ — исполнители увидят заявку в общей ленте и смогут откликнуться.
      </p>
      <RequestForm />
    </div>
  );
}
