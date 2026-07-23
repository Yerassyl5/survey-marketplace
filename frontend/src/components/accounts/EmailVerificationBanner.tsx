"use client";

/* ────────────────────────────────────────────────────────────────────────
   EmailVerificationBanner — этап 4 блока 1.11.
   Рендерится в (app)/layout.tsx между AppNav и main — единственная точка,
   через которую проходят все приватные страницы, баннер виден на каждой
   ровно один раз, без дублирования по страницам.

   Сворачивается на sessionStorage (не localStorage) — крестик прячет его
   до конца вкладки, но НЕ насовсем: новая вкладка/новая сессия браузера
   покажет баннер заново, пока почта реально не подтверждена. Насовсем
   спрятать было бы легко забыть про неподтверждённый аккаунт; форма
   создания заявки/отклика (RequestForm/BidForm) — второй, независимый от
   баннера канал напоминания через 403 email_not_verified.
   ──────────────────────────────────────────────────────────────────────── */

import { useEffect, useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/button";
import * as authApi from "@/lib/api/auth";
import { ApiError } from "@/lib/api/types";

const DISMISS_KEY = "progeo_email_banner_dismissed";

type SendState = "idle" | "sending" | "sent" | "error";

export function EmailVerificationBanner() {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  });
  const [sendState, setSendState] = useState<SendState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // "Письмо отправлено" держится несколько секунд, потом баннер
  // возвращается к обычному виду — таймер обязательно чистится в cleanup
  // эффекта: и при повторном срабатывании (новый setTimeout не должен
  // наслаиваться на старый), и при размонтировании компонента (пользователь
  // мог уйти со страницы до истечения таймера — иначе setState на
  // размонтированном компоненте и предупреждение React).
  useEffect(() => {
    if (sendState !== "sent") return;
    const timer = setTimeout(() => setSendState("idle"), 4000);
    return () => clearTimeout(timer);
  }, [sendState]);

  function handleDismiss() {
    setDismissed(true);
    sessionStorage.setItem(DISMISS_KEY, "1");
  }

  async function handleResend() {
    setSendState("sending");
    setErrorMessage(null);
    try {
      await authApi.resendVerification();
      setSendState("sent");
    } catch (err) {
      setSendState("error");
      // ApiError.message уже переведён (errorMessages.ts, включая правило
      // на 429 "Request was throttled..." → "Слишком много попыток...") —
      // человек не увидит голый английский текст фреймворка.
      setErrorMessage(err instanceof ApiError ? err.message : "Не удалось отправить письмо.");
    }
  }

  if (dismissed) return null;

  return (
    <div style={{ maxWidth: "var(--ds-max-w)", margin: "0 auto", padding: "12px var(--ds-pad) 0" }}>
      <Alert variant="warning">
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", width: "100%" }}>
          <span style={{ flex: 1, minWidth: 200 }}>
            {sendState === "sent"
              ? "Письмо отправлено — проверьте почту."
              : "Подтвердите почту, чтобы создавать заявки и откликаться на них."}
          </span>
          {sendState !== "sent" && (
            <Button
              onClick={handleResend}
              disabled={sendState === "sending"}
              size="sm"
              variant="outline"
              style={{ flexShrink: 0 }}
            >
              {sendState === "sending" ? "Отправляем…" : "Отправить письмо повторно"}
            </Button>
          )}
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Скрыть уведомление"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "inherit",
              fontSize: 18,
              lineHeight: 1,
              padding: 4,
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>
      </Alert>
      {sendState === "error" && errorMessage && (
        <div style={{ marginTop: 8 }}>
          <Alert variant="error">{errorMessage}</Alert>
        </div>
      )}
    </div>
  );
}
