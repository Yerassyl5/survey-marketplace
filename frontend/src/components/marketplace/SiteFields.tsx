"use client";

/* ────────────────────────────────────────────────────────────────────────
   SiteFields.tsx — блок «Участок» формы создания заявки: точка на карте
   ИЛИ файл (KML/GeoJSON) — ровно один источник геометрии обязателен. Site
   больше не переиспользуется между заявками (упрощено 2026-07-07 вместе с
   удалением address/cadastral_number из модели) — форма всегда создаёт
   новый Site, выбора «из существующих» больше нет.

   Если заданы и точка, и файл — при сабмите (см. RequestForm.tsx) побеждает
   файл: он несёт точный контур, точка используется только как временный
   якорь для создания Site (Site.geometry — NOT NULL в БД, а серверный
   парсинг файла — отдельный второй вызов ПОСЛЕ создания объекта, который эту
   точку тут же перезаписывает).
   ──────────────────────────────────────────────────────────────────────── */

import { FilePicker } from "@/components/ui/FilePicker";
import { FormField } from "@/components/ui/FormField";
import { MapPointPicker } from "@/components/ui/MapPointPicker";
import type { LngLat } from "@/components/ui/MapPointPicker";

export interface SiteFieldsState {
  point: LngLat | null;
  file: File | null;
}

export const EMPTY_SITE_FIELDS: SiteFieldsState = {
  point: null,
  file: null,
};

export interface SiteFieldsErrors {
  geometry?: string;
}

export function validateSiteFields(value: SiteFieldsState): SiteFieldsErrors {
  if (!value.point && !value.file) {
    return { geometry: "Укажите участок: поставьте точку на карте или загрузите файл (KML/GeoJSON)." };
  }
  return {};
}

// Казахстан — тот же дефолтный центр, что и в MapPointPicker (KAZAKHSTAN_CENTER).
// Используется ТОЛЬКО как временная геометрия при создании Site, если приложен
// файл без точки: Site.geometry — NOT NULL в БД, а серверный парсинг файла
// (uploadSiteGeometry) обновляет геометрию УЖЕ существующего объекта — значит
// объект сначала нужно создать с какой-то геометрией. Этот центр тут же
// перезаписывается вторым вызовом внутри того же submit (см. RequestForm.tsx) —
// пользователь его не видит, между вызовами нет ни одного запроса на чтение.
const FALLBACK_CENTER: LngLat = { lng: 71.4, lat: 51.1 };

/** Геометрия для POST /api/sites/ — точка, если задана, иначе временный
 * FALLBACK_CENTER (см. комментарий выше), который перезапишет файл. */
export function resolveInitialGeometry(state: SiteFieldsState): GeoJSON.Geometry {
  const point = state.point ?? FALLBACK_CENTER;
  return { type: "Point", coordinates: [point.lng, point.lat] };
}

export interface SiteFieldsProps {
  value: SiteFieldsState;
  onChange: (next: SiteFieldsState) => void;
  errors: SiteFieldsErrors;
}

export function SiteFields({ value, onChange, errors }: SiteFieldsProps) {
  function patch(patchValue: Partial<SiteFieldsState>) {
    onChange({ ...value, ...patchValue });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <FormField
        id="site-point"
        label="Точка на карте"
        error={errors.geometry}
        hint={
          value.file
            ? "Геометрия берётся из файла — точка ниже игнорируется."
            : "Кликните по карте, чтобы отметить участок, или приложите файл ниже."
        }
      >
        <MapPointPicker value={value.point} onChange={(point) => patch({ point })} hasError={Boolean(errors.geometry)} />
      </FormField>

      <FormField
        id="site-geometry-file"
        label="Файл участка (необязательно, если задана точка)"
        hint="KML или GeoJSON — если приложен, геометрия участка берётся из файла, точка на карте не используется."
      >
        <FilePicker
          id="site-geometry-file"
          file={value.file}
          onChange={(file) => patch({ file })}
          accept=".kml,.geojson,.json"
          buttonLabel="Загрузить файл"
        />
      </FormField>
    </div>
  );
}
