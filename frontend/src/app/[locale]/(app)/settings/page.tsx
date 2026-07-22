"use client";

/* ────────────────────────────────────────────────────────────────────────
   /ru/settings — приватный кабинет: свои данные на просмотр, смена
   телефона/пароля, у исполнителя ещё «О себе» и верификация. Вход — клик
   по имени в шапке (AppNav.tsx). Публичная карточка исполнителя — отдельная
   страница /ru/contractors/[id] (этап 5), сюда не относится.

   Четыре НЕЗАВИСИМЫХ блока сохранения (телефон / пароль / «О себе» /
   документы) — каждый со своей кнопкой и своим состоянием ошибки/успеха.
   Один общий сабмит был бы неверен: ошибка формата пароля не должна
   блокировать сохранение телефона, и наоборот.
   ──────────────────────────────────────────────────────────────────────── */

import { useEffect, useState } from "react";
import type { CSSProperties, FormEvent, ReactNode } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/button";
import { FilePicker } from "@/components/ui/FilePicker";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { useRouter as useI18nRouter } from "@/i18n/navigation";
import { AuthRequiredError } from "@/lib/api/client";
import { changePassword, getProfile, updateProfile, uploadContractorDocuments } from "@/lib/api/auth";
import { clearTokens } from "@/lib/api/tokens";
import { ApiError } from "@/lib/api/types";
import type { ProfileResponse } from "@/lib/api/types";

/* ── Секция-карточка (тот же визуальный язык, что Section в RequestForm.tsx —
   не переиспользуется напрямую: тот локален в своём файле, здесь другая
   форма данных, дублировать 15 строк проще, чем выносить общий компонент
   ради одного второго потребителя). ─────────────────────────────────────── */
function Section({ title, children }: { title: string; children: ReactNode }) {
  const style: CSSProperties = {
    padding: 24,
    background: "var(--ds-bg-white)",
    border: "1px solid var(--ds-border)",
    borderRadius: "var(--ds-r-lg)",
    display: "flex",
    flexDirection: "column",
    gap: 16,
  };
  return (
    <div style={style}>
      <h2 style={{ fontFamily: "var(--ds-font-heading)", fontSize: 16, fontWeight: 700, color: "var(--ds-text)", margin: 0 }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

/* ── Данные аккаунта (read-only) ──────────────────────────────────────── */
const PERSON_TYPE_LABELS: Record<string, string> = {
  individual: "Физическое лицо",
  legal: "Юридическое лицо",
};

const ROLE_LABELS: Record<string, string> = {
  customer: "Заказчик",
  contractor: "Исполнитель",
};

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 16,
        padding: "8px 0",
        borderBottom: "1px solid var(--ds-border)",
      }}
    >
      <span style={{ fontFamily: "var(--ds-font-body)", fontSize: 13, color: "var(--ds-text-sec)" }}>{label}</span>
      <span style={{ fontFamily: "var(--ds-font-body)", fontSize: 13, fontWeight: 600, color: "var(--ds-text)", textAlign: "right" }}>
        {value || "—"}
      </span>
    </div>
  );
}

function ReadOnlySection({ profile }: { profile: ProfileResponse }) {
  return (
    <Section title="Данные аккаунта">
      <ReadOnlyRow label="Email" value={profile.email} />
      <ReadOnlyRow label="ФИО" value={profile.full_name} />
      <ReadOnlyRow label="Роль" value={ROLE_LABELS[profile.role] ?? profile.role} />
      <ReadOnlyRow label="Тип лица" value={PERSON_TYPE_LABELS[profile.person_type] ?? profile.person_type} />
      {profile.person_type === "individual" ? (
        <ReadOnlyRow label="ИИН" value={profile.iin} />
      ) : (
        <>
          <ReadOnlyRow label="БИН" value={profile.bin} />
          <ReadOnlyRow label="Организация" value={profile.organization_name} />
          <ReadOnlyRow label="Должность" value={profile.position} />
        </>
      )}
    </Section>
  );
}

/* ── Телефон (редактируется, обе роли) ────────────────────────────────── */
function PhoneSection({ profile, onSaved }: { profile: ProfileResponse; onSaved: (p: ProfileResponse) => void }) {
  const [phone, setPhone] = useState(profile.phone);
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const isDirty = phone !== profile.phone;

  async function handleSave() {
    setFieldError(undefined);
    setFormError(null);
    setSuccess(false);
    setIsSaving(true);
    try {
      const updated = await updateProfile({ phone });
      onSaved(updated);
      setSuccess(true);
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors?.phone) {
        setFieldError(err.fieldErrors.phone[0]);
      } else if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        setFormError("Не удалось сохранить телефон.");
      }
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Section title="Телефон">
      {formError && <Alert variant="error">{formError}</Alert>}
      {success && <Alert variant="info">Сохранено.</Alert>}
      <FormField id="settings-phone" label="Телефон" error={fieldError}>
        <Input
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
            setSuccess(false);
          }}
        />
      </FormField>
      <Button type="button" onClick={handleSave} disabled={!isDirty || isSaving} style={{ alignSelf: "flex-start" }}>
        {isSaving ? "Сохранение…" : "Сохранить"}
      </Button>
    </Section>
  );
}

/* ── Верификация (только исполнитель): статус-карточка + форма сканов ──── */
interface VerificationCardStyle {
  bg: string;
  text: string;
  border?: string;
  heading: string;
  /** Каждый элемент — отдельный абзац (не склеивать в одну строку —
   * например, у состояния "не загружено" два смысловых абзаца, которые
   * должны читаться раздельно, см. решение пользователя). */
  body?: string[];
  /** Только у rejected — индивидуальный текст модератора, визуально отделён
   * от системного заголовка вложенной карточкой (решение пользователя,
   * вариант "вложенная карточка другого фона": системный статус-блок
   * снаружи, простая белая карточка с меткой "Комментарий модератора"
   * внутри — читается как чужие слова, не системный текст). */
  moderatorComment?: string;
}

function getVerificationCardStyle(profile: ProfileResponse): VerificationCardStyle {
  if (profile.verification_status === "verified") {
    return {
      bg: "var(--ds-ver-bg)",
      text: "var(--ds-ver-text)",
      border: "var(--ds-ver-border)",
      heading: "Вы верифицированы",
      body: ["Заказчики видят отметку о верификации в ваших откликах и на публичной карточке."],
    };
  }
  if (profile.verification_status === "rejected") {
    return {
      bg: "var(--ds-error-bg)",
      text: "var(--ds-error)",
      heading: "Верификация отклонена",
      moderatorComment: profile.rejection_reason || "Причина не указана — обратитесь в поддержку.",
    };
  }
  if (profile.has_license_scan || profile.has_attestation_scan) {
    // Без второй строки про ручную проверку сознательно — проверка со
    // временем станет автоматической, обещание про модератора устареет.
    return {
      bg: "var(--ds-review-bg)",
      text: "var(--ds-review-text)",
      heading: "Документы на проверке",
    };
  }
  // Ничего не загружено ни разу — самое заметное состояние из четырёх
  // (см. решение пользователя): новый исполнитель должен сразу понять,
  // что от него требуется действие, не просто нейтральный статус. Текст —
  // порядок утверждён пользователем: что такое верификация → что она даёт →
  // что видит заказчик без неё → какие документы нужны (отдельным абзацем).
  return {
    bg: "var(--ds-select-bg)",
    text: "var(--ds-select-text)",
    heading: "Пройдите верификацию",
    body: [
      "Верификация — это проверка ваших документов об образовании и допуске к изыскательским работам. У верифицированных исполнителей заказчик видит отметку о проверке в отклике и на публичной карточке; без неё он видит, что документы не проверены. На возможность откликаться это не влияет.",
      "Для верификации нужны: скан диплома о высшем или среднем специальном образовании в области геодезии и картографии и скан лицензии на выполнение соответствующего вида изыскательских работ.",
    ],
  };
}

function VerificationSection({
  profile,
  onDocumentsUploaded,
}: {
  profile: ProfileResponse;
  onDocumentsUploaded: () => Promise<void>;
}) {
  const [licenseScan, setLicenseScan] = useState<File | null>(null);
  const [attestationScan, setAttestationScan] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const card = getVerificationCardStyle(profile);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSuccess(false);
    setIsSaving(true);
    try {
      await uploadContractorDocuments({
        licenseScan: licenseScan ?? undefined,
        attestationScan: attestationScan ?? undefined,
      });
      // Ответ PATCH contractor/documents/ — не форма профиля (только сканы),
      // а verification_status/has_*_scan на бэкенде уже сброшены в pending —
      // рефетч всего профиля, не ручной мердж (тот же принцип, что уже в
      // /requests/[id]: ответ мутации не содержит достаточно данных).
      await onDocumentsUploaded();
      setLicenseScan(null);
      setAttestationScan(null);
      setSuccess(true);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Не удалось отправить документы.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Section title="Верификация">
      <div
        style={{
          padding: 16,
          borderRadius: "var(--ds-r-md)",
          background: card.bg,
          border: card.border ? `1px solid ${card.border}` : undefined,
        }}
      >
        <p
          style={{
            fontFamily: "var(--ds-font-heading)",
            fontWeight: 700,
            fontSize: 14,
            color: card.text,
            margin: card.body || card.moderatorComment ? "0 0 8px" : 0,
          }}
        >
          {card.heading}
        </p>
        {card.body?.map((paragraph, i) => (
          <p
            key={i}
            style={{
              fontFamily: "var(--ds-font-body)",
              fontSize: 13,
              color: card.text,
              margin: i < card.body!.length - 1 ? "0 0 8px" : 0,
            }}
          >
            {paragraph}
          </p>
        ))}
        {card.moderatorComment && (
          <div
            style={{
              padding: 12,
              borderRadius: "var(--ds-r-md)",
              background: "var(--ds-bg-white)",
            }}
          >
            <p
              style={{
                fontFamily: "var(--ds-font-body)",
                fontSize: 11,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                color: "var(--ds-text-muted)",
                margin: "0 0 4px",
              }}
            >
              Комментарий модератора
            </p>
            <p style={{ fontFamily: "var(--ds-font-body)", fontSize: 13, color: "var(--ds-text)", margin: 0 }}>
              {card.moderatorComment}
            </p>
          </div>
        )}
      </div>

      {formError && <Alert variant="error">{formError}</Alert>}
      {success && <Alert variant="info">Документы отправлены на проверку.</Alert>}

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <FormField id="settings-license-scan" label="Скан лицензии">
          <FilePicker
            id="settings-license-scan"
            file={licenseScan}
            onChange={setLicenseScan}
            accept=".pdf,.jpg,.jpeg,.png"
            buttonLabel="Выбрать файл"
          />
        </FormField>
        <FormField id="settings-attestation-scan" label="Скан аттестата">
          <FilePicker
            id="settings-attestation-scan"
            file={attestationScan}
            onChange={setAttestationScan}
            accept=".pdf,.jpg,.jpeg,.png"
            buttonLabel="Выбрать файл"
          />
        </FormField>
        <Button type="submit" disabled={isSaving || (!licenseScan && !attestationScan)} style={{ alignSelf: "flex-start" }}>
          {isSaving ? "Отправка…" : "Отправить на проверку"}
        </Button>
      </form>
    </Section>
  );
}

/* ── Пароль ────────────────────────────────────────────────────────────── */
function PasswordSection() {
  const i18nRouter = useI18nRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    current_password?: string;
    new_password?: string;
    new_password_confirm?: string;
  }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    setFormError(null);

    // Совпадение — проверка на клиенте, до отправки; бэкенд не знает про
    // "второй ввод" вообще (принимает один new_password), это чисто UX-защита
    // от опечатки при вводе нового пароля.
    if (newPassword !== newPasswordConfirm) {
      setFieldErrors({ new_password_confirm: "Пароли не совпадают." });
      return;
    }

    setIsSaving(true);
    try {
      await changePassword({ current_password: currentPassword, new_password: newPassword });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) {
        setFieldErrors({
          current_password: err.fieldErrors.current_password?.[0],
          new_password: err.fieldErrors.new_password?.[0],
        });
      } else if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        setFormError("Не удалось сменить пароль.");
      }
    } finally {
      setIsSaving(false);
    }
  }

  // После смены пароля backend блеклистит ВСЕ refresh-токены пользователя,
  // включая текущий (этап 2) — обычный useAuth().logout()/authApi.logout()
  // здесь НЕЛЬЗЯ звать: он сам шлёт POST /accounts/logout/ с уже
  // блеклистнутым refresh и упадёт ошибкой. Чистим токены напрямую и уводим
  // на /login явным кликом (без автотаймера — в проекте нет ни одного
  // setTimeout-редиректа, не заводим первый ради этого).
  function handleGoToLogin() {
    clearTokens();
    i18nRouter.replace("/login");
  }

  if (done) {
    return (
      <Section title="Пароль">
        <Alert variant="info">Пароль изменён. Войдите заново — на всех устройствах требуется повторный вход.</Alert>
        <Button type="button" onClick={handleGoToLogin} style={{ alignSelf: "flex-start" }}>
          Войти
        </Button>
      </Section>
    );
  }

  return (
    <Section title="Пароль">
      {formError && <Alert variant="error">{formError}</Alert>}
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <FormField id="settings-current-password" label="Текущий пароль" error={fieldErrors.current_password}>
          <Input
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </FormField>
        <FormField id="settings-new-password" label="Новый пароль" error={fieldErrors.new_password} hint="Не короче 8 символов.">
          <Input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </FormField>
        <FormField id="settings-new-password-confirm" label="Повторите новый пароль" error={fieldErrors.new_password_confirm}>
          <Input
            type="password"
            autoComplete="new-password"
            value={newPasswordConfirm}
            onChange={(e) => setNewPasswordConfirm(e.target.value)}
          />
        </FormField>
        <Button
          type="submit"
          disabled={isSaving || !currentPassword || !newPassword || !newPasswordConfirm}
          style={{ alignSelf: "flex-start" }}
        >
          {isSaving ? "Сохранение…" : "Сменить пароль"}
        </Button>
      </form>
    </Section>
  );
}

/* ── Скелетон загрузки ────────────────────────────────────────────────── */
function SettingsSkeleton() {
  const bar = (w: number, h = 14): CSSProperties => ({
    width: w,
    height: h,
    borderRadius: 4,
    background: "var(--ds-border)",
    animation: "progeo-pulse 1.4s ease-in-out infinite",
  });
  const card: CSSProperties = {
    padding: 24,
    background: "var(--ds-bg-white)",
    border: "1px solid var(--ds-border)",
    borderRadius: "var(--ds-r-lg)",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={card}>
        <div style={bar(140)} />
        <div style={bar(320)} />
        <div style={bar(280)} />
      </div>
      <div style={card}>
        <div style={bar(100)} />
        <div style={bar(240)} />
      </div>
    </div>
  );
}

/* ── Страница ──────────────────────────────────────────────────────────── */
export default function SettingsPage() {
  const i18nRouter = useI18nRouter();
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getProfile()
      .then((data) => {
        if (!cancelled) setProfile(data);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof AuthRequiredError) {
          i18nRouter.replace("/login");
          return;
        }
        setLoadError(err instanceof ApiError ? err.message : "Не удалось загрузить профиль.");
      });
    return () => {
      cancelled = true;
    };
  }, [i18nRouter]);

  async function refetchProfile() {
    const data = await getProfile();
    setProfile(data);
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "40px var(--ds-pad)" }}>
      <h1
        style={{
          fontFamily: "var(--ds-font-heading)",
          fontSize: 26,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          color: "var(--ds-text)",
          margin: "0 0 24px",
        }}
      >
        Настройки
      </h1>

      {loadError ? (
        <Alert variant="error">{loadError}</Alert>
      ) : !profile ? (
        <SettingsSkeleton />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <ReadOnlySection profile={profile} />
          <PhoneSection profile={profile} onSaved={setProfile} />
          {profile.role === "contractor" && (
            <VerificationSection profile={profile} onDocumentsUploaded={refetchProfile} />
          )}
          <PasswordSection />
        </div>
      )}
    </div>
  );
}
