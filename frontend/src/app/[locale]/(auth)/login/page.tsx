"use client";

/* ────────────────────────────────────────────────────────────────────────
   /ru/login — вход по email+паролю.
   POST /api/accounts/login/ через useAuth().login(), токены сохраняются
   в lib/api/tokens.ts. Успех → редирект по роли: contractor → /feed,
   customer → /dashboard (его кабинет; название/маршрут — открытый вопрос,
   см. docs/progress.md).
   ──────────────────────────────────────────────────────────────────────── */

import { useState } from "react";
import type { FormEvent } from "react";

import { AppNav } from "@/components/ui/AppNav";
import { AppFooter } from "@/components/ui/AppFooter";
import { Alert } from "@/components/ui/Alert";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError } from "@/lib/api/types";
import { Link, useRouter } from "@/i18n/navigation";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [emailTouched, setEmailTouched] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const emailError =
    emailTouched && email.length > 0 && !/^\S+@\S+\.\S+$/.test(email)
      ? "Введите корректный email."
      : null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!email || !password) {
      setFormError("Заполните email и пароль.");
      return;
    }
    if (emailError) return;

    setIsSubmitting(true);
    try {
      const user = await login(email, password, remember);
      router.push(user.role === "contractor" ? "/feed" : "/dashboard");
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        setFormError("Не удалось войти. Попробуйте ещё раз.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--ds-bg)" }}>
      <AppNav variant="public" activeLink="/login" />

      <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 16px" }}>
        <div
          style={{
            width: "100%",
            maxWidth: 400,
            background: "var(--ds-bg-white)",
            border: "1px solid var(--ds-border)",
            borderRadius: "var(--ds-r-xl)",
            padding: 32,
          }}
        >
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
            Вход
          </h1>
          <p style={{ fontFamily: "var(--ds-font-body)", fontSize: 14, color: "var(--ds-text-sec)", margin: "0 0 24px" }}>
            Войдите, чтобы продолжить работу с платформой.
          </p>

          <form onSubmit={handleSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {formError && <Alert variant="error">{formError}</Alert>}

            <FormField id="login-email" label="Email" required error={emailError ?? undefined}>
              <Input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setEmailTouched(true)}
                placeholder="you@company.kz"
              />
            </FormField>

            <FormField id="login-password" label="Пароль" required>
              <Input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </FormField>

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontFamily: "var(--ds-font-body)",
                  fontSize: 14,
                  color: "var(--ds-text)",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: "var(--ds-blue)" }}
                />
                Запомнить меня
              </label>
              <p
                style={{
                  fontFamily: "var(--ds-font-body)",
                  fontSize: 12,
                  color: "var(--ds-text-muted)",
                  margin: "0 0 0 24px",
                }}
              >
                Оставаться в системе на этом устройстве. На общем компьютере снимите галочку.
              </p>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: -8 }}>
              <Link
                href="/forgot-password"
                style={{ fontFamily: "var(--ds-font-body)", fontSize: 13, color: "var(--ds-blue)", fontWeight: 600, textDecoration: "none" }}
              >
                Забыли пароль?
              </Link>
            </div>

            <Button type="submit" disabled={isSubmitting} style={{ height: 44, marginTop: 4 }}>
              {isSubmitting ? "Вход…" : "Войти"}
            </Button>
          </form>

          <p
            style={{
              fontFamily: "var(--ds-font-body)",
              fontSize: 13,
              color: "var(--ds-text-sec)",
              textAlign: "center",
              marginTop: 20,
            }}
          >
            Нет аккаунта?{" "}
            <Link href="/register" style={{ color: "var(--ds-blue)", fontWeight: 600, textDecoration: "none" }}>
              Зарегистрироваться
            </Link>
          </p>
        </div>
      </main>

      <AppFooter compact />
    </div>
  );
}
