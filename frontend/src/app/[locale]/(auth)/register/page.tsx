"use client";

/* ────────────────────────────────────────────────────────────────────────
   /ru/register — регистрация: роль → тип лица → условные поля (ИИН/БИН).
   Один экран с прогрессивным раскрытием (не wizard) — четыре шага не
   оправдывают отдельный прогресс-бар. После успешной регистрации —
   автологин и редирект на "/".
   ──────────────────────────────────────────────────────────────────────── */

import { useState } from "react";
import type { FormEvent } from "react";

import { AppNav } from "@/components/ui/AppNav";
import { AppFooter } from "@/components/ui/AppFooter";
import { Alert } from "@/components/ui/Alert";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/button";
import { RoleSelectCard } from "@/components/auth/RoleSelectCard";
import { PersonTypeToggle, type PersonTypeValue } from "@/components/auth/PersonTypeToggle";
import { useAuth } from "@/contexts/AuthContext";
import { registerContractor, registerCustomer } from "@/lib/api/auth";
import { ApiError, type Role } from "@/lib/api/types";
import { Link, useRouter } from "@/i18n/navigation";

type FieldErrors = Partial<Record<"full_name" | "email" | "phone" | "password" | "iin" | "bin", string>>;

export default function RegisterPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [role, setRole] = useState<Role | null>(null);
  const [personType, setPersonType] = useState<PersonTypeValue>("individual");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [iin, setIin] = useState("");
  const [bin, setBin] = useState("");

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (!fullName.trim()) errors.full_name = "Укажите ФИО.";
    if (!email.trim()) errors.email = "Укажите email.";
    else if (!/^\S+@\S+\.\S+$/.test(email)) errors.email = "Введите корректный email.";
    if (!phone.trim()) errors.phone = "Укажите телефон.";
    if (password.length < 8) errors.password = "Пароль должен быть не короче 8 символов.";
    if (personType === "individual") {
      if (!/^\d{12}$/.test(iin)) errors.iin = "ИИН — 12 цифр.";
    } else {
      if (!/^\d{12}$/.test(bin)) errors.bin = "БИН — 12 цифр.";
    }
    return errors;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!role) {
      setFormError("Выберите роль.");
      return;
    }

    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const payload = {
      email,
      password,
      person_type: personType,
      full_name: fullName,
      phone,
      ...(personType === "individual" ? { iin } : { bin }),
    };

    setIsSubmitting(true);
    try {
      if (role === "customer") {
        await registerCustomer(payload);
      } else {
        await registerContractor(payload);
      }
      // Автологин, чтобы не заставлять пользователя вводить те же данные повторно.
      try {
        await login(email, password);
        router.push("/");
      } catch {
        router.push("/login");
      }
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) {
        const knownFields = ["full_name", "email", "phone", "password", "iin", "bin"] as const;
        const mapped: FieldErrors = {};
        for (const key of knownFields) {
          const messages = err.fieldErrors[key];
          if (messages?.[0]) mapped[key] = messages[0];
        }
        setFieldErrors(mapped);
        if (Object.keys(mapped).length === 0) setFormError(err.message);
      } else if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        setFormError("Не удалось зарегистрироваться. Попробуйте ещё раз.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--ds-bg)" }}>
      <AppNav variant="public" activeLink="/register" />

      <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 16px" }}>
        <div
          style={{
            width: "100%",
            maxWidth: 480,
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
            Регистрация
          </h1>
          <p style={{ fontFamily: "var(--ds-font-body)", fontSize: 14, color: "var(--ds-text-sec)", margin: "0 0 24px" }}>
            Выберите роль, чтобы продолжить.
          </p>

          <form onSubmit={handleSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {formError && <Alert variant="error">{formError}</Alert>}

            <div role="radiogroup" aria-label="Выберите роль" style={{ display: "flex", gap: 12 }}>
              <RoleSelectCard
                title="Заказчик"
                description="Публикую заявки на изыскания."
                selected={role === "customer"}
                onSelect={() => setRole("customer")}
              />
              <RoleSelectCard
                title="Исполнитель"
                description="Откликаюсь на заявки, выполняю работы."
                selected={role === "contractor"}
                onSelect={() => setRole("contractor")}
              />
            </div>

            {role && (
              <>
                {role === "contractor" && (
                  <Alert variant="info">
                    Без загрузки лицензии и аттестата аккаунт будет не верифицирован — заказчики
                    видят статус верификации. Документы можно приложить сразу после регистрации,
                    в профиле.
                  </Alert>
                )}

                <PersonTypeToggle value={personType} onChange={setPersonType} />

                <FormField id="reg-full-name" label="ФИО" required error={fieldErrors.full_name}>
                  <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Иванов Иван Иванович" />
                </FormField>

                <FormField id="reg-email" label="Email" required error={fieldErrors.email}>
                  <Input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.kz"
                  />
                </FormField>

                <FormField id="reg-phone" label="Телефон" required error={fieldErrors.phone}>
                  <Input
                    type="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+7 700 000 00 00"
                  />
                </FormField>

                <FormField id="reg-password" label="Пароль" required hint={fieldErrors.password ? undefined : "Не короче 8 символов."} error={fieldErrors.password}>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </FormField>

                {personType === "individual" ? (
                  <FormField id="reg-iin" label="ИИН" required error={fieldErrors.iin}>
                    <Input
                      inputMode="numeric"
                      maxLength={12}
                      value={iin}
                      onChange={(e) => setIin(e.target.value.replace(/\D/g, ""))}
                      placeholder="123456789012"
                    />
                  </FormField>
                ) : (
                  <FormField id="reg-bin" label="БИН" required error={fieldErrors.bin}>
                    <Input
                      inputMode="numeric"
                      maxLength={12}
                      value={bin}
                      onChange={(e) => setBin(e.target.value.replace(/\D/g, ""))}
                      placeholder="123456789012"
                    />
                  </FormField>
                )}

                <Button type="submit" disabled={isSubmitting} style={{ height: 44, marginTop: 4 }}>
                  {isSubmitting ? "Регистрация…" : "Зарегистрироваться"}
                </Button>
              </>
            )}
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
            Уже есть аккаунт?{" "}
            <Link href="/login" style={{ color: "var(--ds-blue)", fontWeight: 600, textDecoration: "none" }}>
              Войти
            </Link>
          </p>
        </div>
      </main>

      <AppFooter compact />
    </div>
  );
}
