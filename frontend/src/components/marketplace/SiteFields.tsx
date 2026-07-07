"use client";

/* ────────────────────────────────────────────────────────────────────────
   SiteFields.tsx — блок «Объект» формы создания заявки: выбор уже
   существующего объекта заказчика ИЛИ создание нового (адрес + точка на
   карте + опциональный файл KML/GeoJSON, уточняющий контур).

   Почему точка ВСЕГДА обязательна, а файл — опционален (не два равноправных
   способа "или-или", а точка + необязательное уточнение поверх неё):
   Site.geometry в БД — NOT NULL, а POST /api/sites/ создаёт объект сразу
   с геометрией в теле запроса. Файл же (SiteGeometryUploadView) обновляет
   геометрию УЖЕ существующего объекта — значит объект в любом случае нужно
   создать с какой-то геометрией первым шагом. Точка на карте — дешёвый
   способ всегда её иметь; файл, если приложен, заменяет её точным контуром
   вторым вызовом сразу после создания объекта (см. submit в RequestForm.tsx).
   ──────────────────────────────────────────────────────────────────────── */

import type { CSSProperties } from "react";

import { FilePicker } from "@/components/ui/FilePicker";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { MapPointPicker } from "@/components/ui/MapPointPicker";
import type { LngLat } from "@/components/ui/MapPointPicker";
import type { Site } from "@/lib/api/sites";

export interface NewSiteState {
  address: string;
  cadastralNumber: string;
  point: LngLat | null;
  file: File | null;
}

export const EMPTY_NEW_SITE: NewSiteState = {
  address: "",
  cadastralNumber: "",
  point: null,
  file: null,
};

export type SiteFieldsValue =
  | { mode: "existing"; siteId: number | null }
  | { mode: "new"; site: NewSiteState };

export interface SiteFieldsErrors {
  /** Не выбран ни один объект / не выбран режим. */
  selection?: string;
  address?: string;
  point?: string;
}

interface RadioCardProps {
  checked: boolean;
  onSelect: () => void;
  title: string;
  subtitle?: string;
}

function RadioCard({ checked, onSelect, title, subtitle }: RadioCardProps) {
  const style: CSSProperties = {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    padding: "12px 14px",
    border: `1px solid ${checked ? "var(--ds-blue)" : "var(--ds-border)"}`,
    background: checked ? "var(--ds-blue-xlight)" : "var(--ds-bg-white)",
    borderRadius: "var(--ds-r-md)",
    cursor: "pointer",
    transition: "border-color 150ms, background 150ms",
  };
  return (
    <label style={style}>
      <input
        type="radio"
        checked={checked}
        onChange={onSelect}
        style={{ marginTop: 3, accentColor: "var(--ds-blue)", cursor: "pointer", flexShrink: 0 }}
      />
      <span>
        <span style={{ display: "block", fontFamily: "var(--ds-font-body)", fontSize: 14, fontWeight: 600, color: "var(--ds-text)" }}>
          {title}
        </span>
        {subtitle && (
          <span style={{ display: "block", fontFamily: "var(--ds-font-body)", fontSize: 12, color: "var(--ds-text-muted)", marginTop: 2 }}>
            {subtitle}
          </span>
        )}
      </span>
    </label>
  );
}

export function validateSiteFields(value: SiteFieldsValue): SiteFieldsErrors {
  if (value.mode === "existing") {
    return value.siteId == null ? { selection: "Выберите объект из списка." } : {};
  }
  const errors: SiteFieldsErrors = {};
  if (!value.site.address.trim()) errors.address = "Укажите адрес объекта.";
  if (!value.site.point) errors.point = "Укажите точку на карте.";
  return errors;
}

export interface SiteFieldsProps {
  sites: Site[] | null;
  value: SiteFieldsValue;
  onChange: (next: SiteFieldsValue) => void;
  errors: SiteFieldsErrors;
}

export function SiteFields({ sites, value, onChange, errors }: SiteFieldsProps) {
  if (sites === null) {
    return (
      <p style={{ fontFamily: "var(--ds-font-body)", fontSize: 13, color: "var(--ds-text-muted)" }}>
        Загрузка ваших объектов…
      </p>
    );
  }

  const newSite = value.mode === "new" ? value.site : EMPTY_NEW_SITE;

  function selectExisting(siteId: number) {
    onChange({ mode: "existing", siteId });
  }

  function selectNew() {
    onChange({ mode: "new", site: newSite });
  }

  function patchNewSite(patch: Partial<NewSiteState>) {
    onChange({ mode: "new", site: { ...newSite, ...patch } });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {sites.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <RadioCard
            checked={value.mode === "new"}
            onSelect={selectNew}
            title="Новый объект"
            subtitle="Укажите адрес и местоположение — понадобится один раз, дальше объект можно использовать для новых заявок"
          />
          {sites.map((s) => (
            <RadioCard
              key={s.id}
              checked={value.mode === "existing" && value.siteId === s.id}
              onSelect={() => selectExisting(s.id)}
              title={s.properties.address}
              subtitle={s.properties.cadastral_number ? `Кадастровый номер: ${s.properties.cadastral_number}` : undefined}
            />
          ))}
          {errors.selection && (
            <p role="alert" style={{ fontFamily: "var(--ds-font-body)", fontSize: 12, fontWeight: 500, color: "var(--ds-error)", margin: 0 }}>
              {errors.selection}
            </p>
          )}
        </div>
      )}

      {value.mode === "new" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <FormField id="site-address" label="Адрес объекта" required error={errors.address}>
            <Input
              value={newSite.address}
              onChange={(e) => patchNewSite({ address: e.target.value })}
              placeholder="г. Алматы, ул. Примерная, 10"
            />
          </FormField>

          <FormField id="site-cadastral" label="Кадастровый номер (необязательно)">
            <Input
              value={newSite.cadastralNumber}
              onChange={(e) => patchNewSite({ cadastralNumber: e.target.value })}
              placeholder="13-123-456-789"
            />
          </FormField>

          <FormField id="site-point" label="Местоположение на карте" required error={errors.point} hint="Кликните по карте, чтобы поставить точку — она задаёт базовое расположение объекта.">
            <MapPointPicker value={newSite.point} onChange={(point) => patchNewSite({ point })} hasError={Boolean(errors.point)} />
          </FormField>

          <FormField
            id="site-geometry-file"
            label="Точный контур участка (необязательно)"
            hint="KML или GeoJSON — если приложите, заменит точку выше точным контуром (важно для оценки объёма/площади исполнителем)."
          >
            <FilePicker
              id="site-geometry-file"
              file={newSite.file}
              onChange={(file) => patchNewSite({ file })}
              accept=".kml,.geojson,.json"
              buttonLabel="Загрузить файл"
            />
          </FormField>
        </div>
      )}
    </div>
  );
}
