"use client";

/* ────────────────────────────────────────────────────────────────────────
   /ru/forgot-password — заглушка.
   Полноценный сброс пароля через код на email — отдельный будущий блок
   «почта + уведомления» (нужен SMTP-провайдер, шаблоны писем, модель
   токенов сброса, rate limiting — см. docs/progress.md). Пока — страница
   на месте кнопки, без реальной логики сброса.
   ──────────────────────────────────────────────────────────────────────── */

import { AppNav } from "@/components/ui/AppNav";
import { AppFooter } from "@/components/ui/AppFooter";
import { Link } from "@/i18n/navigation";

export default function ForgotPasswordPage() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--ds-bg)" }}>
      <AppNav variant="public" />

      <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 16px" }}>
        <div
          style={{
            width: "100%",
            maxWidth: 400,
            background: "var(--ds-bg-white)",
            border: "1px solid var(--ds-border)",
            borderRadius: "var(--ds-r-xl)",
            padding: 32,
            textAlign: "center",
          }}
        >
          <h1
            style={{
              fontFamily: "var(--ds-font-heading)",
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "var(--ds-text)",
              margin: "0 0 12px",
            }}
          >
            Восстановление пароля
          </h1>
          <p style={{ fontFamily: "var(--ds-font-body)", fontSize: 14, color: "var(--ds-text-sec)", margin: "0 0 24px" }}>
            Функция скоро появится. Пока восстановить пароль можно, обратившись в поддержку.
          </p>
          <Link href="/login" style={{ color: "var(--ds-blue)", fontWeight: 600, fontSize: 14, textDecoration: "none" }}>
            ← Вернуться ко входу
          </Link>
        </div>
      </main>

      <AppFooter compact />
    </div>
  );
}
