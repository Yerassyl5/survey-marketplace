"use client";

/* ────────────────────────────────────────────────────────────────────────
   PortfolioSection.tsx — редактирование «О себе» (portfolio_description).
   Используется ТОЛЬКО на своей карточке исполнителя (/ru/contractors/[id],
   этап 5) — чужую карточку этот компонент не касается вообще, там просто
   текст без формы.

   Режим просмотр/редактирование (правка по итогам браузерной проверки
   этапа 5): savedText — последнее СОХРАНЁННОЕ значение, isEditing — правило
   "нет сохранённого текста → сразу форма" (как было раньше), "есть текст →
   читаемый блок + «Редактировать»". «Отмена» видна только когда есть что
   отменять (savedText непустой) — если текста никогда не было, отменять
   нечего, кнопка не показывается (тот же смысл, что и раньше — просто
   форма, без переключателя).
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
  const [savedText, setSavedText] = useState(profile.portfolio_description ?? "");
  const [text, setText] = useState(savedText);
  const [isEditing, setIsEditing] = useState(!savedText.trim());
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const isDirty = text !== savedText;

  async function handleSave() {
    setFormError(null);
    setSuccess(false);
    setIsSaving(true);
    try {
      const updated = await updateProfile({ portfolio_description: text });
      onSaved(updated);
      const newSaved = updated.portfolio_description ?? "";
      setSavedText(newSaved);
      setText(newSaved);
      // Если сохранили пустоту — остаёмся в форме (нечего показывать в
      // читаемом блоке), тот же принцип, что и на первом входе без текста.
      setIsEditing(!newSaved.trim());
      setSuccess(true);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Не удалось сохранить.");
    } finally {
      setIsSaving(false);
    }
  }

  function handleCancel() {
    setText(savedText);
    setFormError(null);
    setIsEditing(false);
  }

  return (
    <Section title="О себе">
      {formError && <Alert variant="error">{formError}</Alert>}
      {success && <Alert variant="info">Сохранено.</Alert>}

      {isEditing ? (
        <>
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
          <div style={{ display: "flex", gap: 12 }}>
            <Button type="button" onClick={handleSave} disabled={!isDirty || isSaving} style={{ alignSelf: "flex-start" }}>
              {isSaving ? "Сохранение…" : "Сохранить"}
            </Button>
            {savedText.trim() && (
              <Button type="button" variant="outline" onClick={handleCancel} disabled={isSaving} style={{ alignSelf: "flex-start" }}>
                Отмена
              </Button>
            )}
          </div>
        </>
      ) : (
        <>
          <p
            style={{
              fontFamily: "var(--ds-font-body)",
              fontSize: 14,
              color: "var(--ds-text)",
              margin: 0,
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
            }}
          >
            {savedText}
          </p>
          <Button type="button" variant="outline" onClick={() => setIsEditing(true)} style={{ alignSelf: "flex-start" }}>
            Редактировать
          </Button>
        </>
      )}
    </Section>
  );
}
