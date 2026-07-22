"use client";

/* ────────────────────────────────────────────────────────────────────────
   PortfolioSection.tsx — редактирование «О себе» (portfolio_description).
   Вынесено из /ru/settings (этап 4): по итогам браузерной проверки решено,
   что «О себе» — это часть ПУБЛИЧНОЙ карточки исполнителя (/ru/contractors/
   [id], этап 5), не приватных настроек. Сама логика PATCH /accounts/profile/
   не менялась — просто переехала в компонент, который смонтируется на
   карточке владельца в следующем этапе.
   ──────────────────────────────────────────────────────────────────────── */

import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/FormField";
import { Textarea } from "@/components/ui/Textarea";
import { updateProfile } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/types";
import type { ProfileResponse } from "@/lib/api/types";

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

export interface PortfolioSectionProps {
  profile: ProfileResponse;
  onSaved: (p: ProfileResponse) => void;
}

export function PortfolioSection({ profile, onSaved }: PortfolioSectionProps) {
  const [text, setText] = useState(profile.portfolio_description ?? "");
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const isDirty = text !== (profile.portfolio_description ?? "");

  async function handleSave() {
    setFormError(null);
    setSuccess(false);
    setIsSaving(true);
    try {
      const updated = await updateProfile({ portfolio_description: text });
      onSaved(updated);
      setSuccess(true);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Не удалось сохранить.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Section title="О себе">
      {formError && <Alert variant="error">{formError}</Alert>}
      {success && <Alert variant="info">Сохранено.</Alert>}
      <FormField id="portfolio-description" label="О себе" hint="Видно заказчикам на вашей публичной карточке.">
        <Textarea
          rows={5}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setSuccess(false);
          }}
          placeholder="Например: опыт работы, специализация, реализованные проекты…"
        />
      </FormField>
      <Button type="button" onClick={handleSave} disabled={!isDirty || isSaving} style={{ alignSelf: "flex-start" }}>
        {isSaving ? "Сохранение…" : "Сохранить"}
      </Button>
    </Section>
  );
}
