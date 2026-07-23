"use client";

/* ────────────────────────────────────────────────────────────────────────
   /ru/verify-email?token=... — подтверждение почты по ссылке из письма
   (этап 4 блока 1.11). Публичная страница ((auth) route group) — токен сам
   доказывает личность, посетитель не обязан быть залогинен в этом браузере.

   useSearchParams() требует <Suspense> в Next 16 (тот же паттерн, что уже
   в FeedPage) — вынесено в отдельный Content-компонент.

   Три состояния по коду ответа backend (VerifyEmailView, этап 3):
   успех / token_expired / invalid_token (последний — и для битого токена,
   и для отсутствующего в URL параметра, и для сетевого сбоя — пользователю
   всё это одинаково «ссылка не работает»).
   ──────────────────────────────────────────────────────────────────────── */

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { AppNav } from "@/components/ui/AppNav";
import { AppFooter } from "@/components/ui/AppFooter";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { Link, useRouter } from "@/i18n/navigation";
import * as authApi from "@/lib/api/auth";
import { ApiError } from "@/lib/api/types";

type Status = "checking" | "success" | "expired" | "invalid";

function Card({ children }: { children: React.ReactNode }) {
  return (
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
      {children}
    </div>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return (
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
      {children}
    </h1>
  );
}

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, isLoading: authLoading, refreshUser } = useAuth();
  const token = searchParams.get("token");

  // Отсутствие token в query — известно уже на первом рендере (searchParams
  // синхронны в клиентском компоненте), не требует эффекта: ленивый
  // инициализатор вычисляет начальное состояние ПРИ РЕНДЕРЕ, а не через
  // setState в теле эффекта (react-hooks/set-state-in-effect — тот же
  // паттерн "adjusting state during render", что уже в FilterBar.tsx/
  // feed/page.tsx, см. docs/progress.md, «Лента заявок»).
  const [status, setStatus] = useState<Status>(() => (token ? "checking" : "invalid"));
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [resendError, setResendError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return; // status уже "invalid" из начального состояния выше
    let cancelled = false;
    void (async () => {
      try {
        await authApi.verifyEmail(token);
        if (cancelled) return;
        setStatus("success");
        // Если посетитель уже залогинен в этом браузере (AuthContext несёт
        // старое is_email_verified=false из /me/ при монтировании) — без
        // этого баннер EmailVerificationBanner ((app)/layout.tsx) продолжил
        // бы показываться после перехода в кабинет, хотя почта уже
        // подтверждена. refreshUser() безопасен и без сессии — она сама
        // проверяет наличие токена и no-op'ает на null (см. AuthContext).
        void refreshUser();
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.code === "token_expired") {
          setStatus("expired");
        } else {
          // invalid_token и любой другой случай (сетевой сбой, неожиданный
          // код) — пользователю разница не важна, ссылка просто не работает.
          setStatus("invalid");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, refreshUser]);

  async function handleResend() {
    setResendState("sending");
    setResendError(null);
    try {
      await authApi.resendVerification();
      setResendState("sent");
    } catch (err) {
      setResendState("error");
      setResendError(err instanceof ApiError ? err.message : "Не удалось отправить письмо.");
    }
  }

  function goToDashboard() {
    // Роль уже известна из контекста — не делаем отдельный запрос ради
    // редиректа (тот же выбор путей, что и /login). Контекст ещё не
    // загрузился/пользователь не залогинен в этом браузере — /feed как
    // безопасный запасной вариант (доступен обеим ролям).
    if (!authLoading && user?.role === "customer") {
      router.push("/requests/my");
    } else {
      router.push("/feed");
    }
  }

  return (
    <Card>
      {status === "checking" && (
        <>
          <Title>Проверяем ссылку…</Title>
        </>
      )}

      {status === "success" && (
        <>
          <Title>Почта подтверждена</Title>
          <p style={{ fontFamily: "var(--ds-font-body)", fontSize: 14, color: "var(--ds-text-sec)", margin: "0 0 24px" }}>
            Теперь вам доступно создание заявок и отклики.
          </p>
          <Button onClick={goToDashboard} style={{ height: 44, width: "100%" }}>
            Перейти в личный кабинет
          </Button>
        </>
      )}

      {status === "expired" && (
        <>
          <Title>Ссылка устарела</Title>
          <p style={{ fontFamily: "var(--ds-font-body)", fontSize: 14, color: "var(--ds-text-sec)", margin: "0 0 20px" }}>
            Ссылка действует 3 суток и уже не работает. Отправьте письмо ещё раз.
          </p>

          {resendState === "sent" ? (
            <Alert variant="info">Письмо отправлено — проверьте почту.</Alert>
          ) : authLoading ? null : user ? (
            <>
              {resendState === "error" && resendError && (
                <div style={{ marginBottom: 12 }}>
                  <Alert variant="error">{resendError}</Alert>
                </div>
              )}
              <Button
                onClick={handleResend}
                disabled={resendState === "sending"}
                style={{ height: 44, width: "100%" }}
              >
                {resendState === "sending" ? "Отправляем…" : "Отправить письмо повторно"}
              </Button>
            </>
          ) : (
            <>
              <p style={{ fontFamily: "var(--ds-font-body)", fontSize: 13, color: "var(--ds-text-sec)", margin: "0 0 16px" }}>
                Войдите, чтобы отправить письмо повторно.
              </p>
              <Link href="/login">
                <Button style={{ height: 44, width: "100%" }}>Войти</Button>
              </Link>
            </>
          )}
        </>
      )}

      {status === "invalid" && (
        <>
          <Title>Ссылка недействительна</Title>
          <p style={{ fontFamily: "var(--ds-font-body)", fontSize: 14, color: "var(--ds-text-sec)", margin: "0 0 24px" }}>
            Проверьте, что ссылка скопирована полностью, или запросите новое письмо в личном кабинете.
          </p>
          <Link href="/login" style={{ color: "var(--ds-blue)", fontWeight: 600, fontSize: 14, textDecoration: "none" }}>
            ← Вернуться ко входу
          </Link>
        </>
      )}
    </Card>
  );
}

export default function VerifyEmailPage() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--ds-bg)" }}>
      <AppNav variant="public" />
      <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 16px" }}>
        <Suspense fallback={<Card><Title>Проверяем ссылку…</Title></Card>}>
          <VerifyEmailContent />
        </Suspense>
      </main>
      <AppFooter compact />
    </div>
  );
}
