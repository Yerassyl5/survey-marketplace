"use client";

/* ────────────────────────────────────────────────────────────────────────
   SiteFields.tsx — блок «Участок» формы создания заявки: точка на карте
   ИЛИ файл (KML/GeoJSON) — ровно один источник геометрии обязателен. Site
   больше не переиспользуется между заявками (упрощено 2026-07-07 вместе с
   удалением address/cadastral_number из модели) — форма всегда создаёт
   новый Site, выбора «из существующих» больше нет.

   Файл парсится ЗДЕСЬ, на клиенте формы, ДО создания Site — через
   POST /api/geo/parse-geometry/ (бесстейтовый, ничего не сохраняет).
   2026-07-08: раньше Site создавался сразу с временной точкой-заглушкой
   (FALLBACK_CENTER), которую второй запрос (uploadSiteGeometry) тут же
   перезаписывал геометрией из файла — при сбое второго запроса в БД мог
   остаться Site с фейковыми координатами. Теперь порядок обратный: файл
   парсится первым, Site создаётся уже с финальной геометрией одним вызовом
   createSite() — заглушки в принципе больше не существует.

   Карта — условный рендер одного из двух ГОТОВЫХ компонентов, оба не
   изменены: пока нет успешно распарсенного файла — MapPointPicker (ввод
   клика); как только файл распарсен — SiteMap (только чтение, автозум по
   геометрии). Если заданы и точка, и файл — при сабмите (resolveGeometry)
   побеждает файл: он несёт точный контур, точка на карте лишь заменяется
   картой из файла и в API не уходит.
   ──────────────────────────────────────────────────────────────────────── */

import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";

import { FilePicker } from "@/components/ui/FilePicker";
import { FormField } from "@/components/ui/FormField";
import { MapPointPicker } from "@/components/ui/MapPointPicker";
import type { LngLat } from "@/components/ui/MapPointPicker";
import { SiteMap } from "@/components/ui/SiteMap";
import { parseGeometryFile } from "@/lib/api/sites";
import { ApiError } from "@/lib/api/types";

export interface SiteFieldsState {
  point: LngLat | null;
  file: File | null;
  /** Геометрия, полученная от POST /api/geo/parse-geometry/ — null, пока файла
   * нет, идёт парсинг, или парсинг закончился ошибкой (см. fileParseError). */
  parsedFileGeometry: GeoJSON.Geometry | null;
  isParsingFile: boolean;
  fileParseError: string | null;
}

export const EMPTY_SITE_FIELDS: SiteFieldsState = {
  point: null,
  file: null,
  parsedFileGeometry: null,
  isParsingFile: false,
  fileParseError: null,
};

export interface SiteFieldsErrors {
  geometry?: string;
}

export function validateSiteFields(value: SiteFieldsState): SiteFieldsErrors {
  if (value.isParsingFile) {
    return { geometry: "Дождитесь проверки файла." };
  }
  if (value.fileParseError) {
    return { geometry: "Исправьте ошибку в файле участка или уберите его." };
  }
  if (!value.point && !value.parsedFileGeometry) {
    return { geometry: "Укажите участок: поставьте точку на карте или загрузите файл (KML/GeoJSON)." };
  }
  return {};
}

/** Финальная геометрия для POST /api/sites/ — геометрия из файла побеждает
 * точку (см. хедер-комментарий). null означает, что validateSiteFields()
 * должен был заблокировать сабмит раньше, чем этот вызов вообще случится. */
export function resolveGeometry(state: SiteFieldsState): GeoJSON.Geometry | null {
  if (state.parsedFileGeometry) return state.parsedFileGeometry;
  if (state.point) return { type: "Point", coordinates: [state.point.lng, state.point.lat] };
  return null;
}

export interface SiteFieldsProps {
  value: SiteFieldsState;
  onChange: (next: SiteFieldsState) => void;
  errors: SiteFieldsErrors;
}

// Тот же визуальный паттерн плейсхолдера, что в SiteMap.tsx/MapPointPicker.tsx
// (не импортируется оттуда — эти компоненты сознательно не трогаем).
const mapLoadingStyle: CSSProperties = {
  height: 320,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "var(--ds-bg)",
  border: "1px solid var(--ds-border)",
  borderRadius: "var(--ds-r-lg)",
  color: "var(--ds-text-muted)",
  fontFamily: "var(--ds-font-body)",
  fontSize: 13,
};

// FormField клонирует единственного ребёнка и добавляет id/aria-describedby/
// hasError (см. FormField.tsx) — MapPointPicker и SiteMap оба принимают эти
// пропы (или молча игнорируют лишние, как SiteMap). Голый <div> — DOM-узел,
// не React-компонент: hasError на нём React не распознаёт и ругается в
// консоли ("does not recognize the hasError prop on a DOM element"). Именованный
// компонент явно берёт то, что реально нужно для a11y (id/aria-describedby —
// для связки с <label htmlFor> и текстом подсказки), hasError не объявляет и
// не подсвечивает: "идёт парсинг" — нейтральное ожидание, не состояние ошибки.
interface MapLoadingPlaceholderProps {
  id?: string;
  "aria-describedby"?: string;
}

function MapLoadingPlaceholder({ id, "aria-describedby": describedBy }: MapLoadingPlaceholderProps) {
  return (
    <div id={id} aria-describedby={describedBy} style={mapLoadingStyle}>
      Проверяем файл…
    </div>
  );
}

export function SiteFields({ value, onChange, errors }: SiteFieldsProps) {
  // onChange меняется на каждый рендер родителя, а эффект ниже реагирует
  // только на смену файла — держим актуальный value в ref (как onChangeRef в
  // MapPointPicker.tsx), чтобы async-колбэки parseGeometryFile() не затирали
  // точку/другие поля, если они изменились, пока запрос был в полёте.
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  });

  useEffect(() => {
    if (!value.file) return;
    const file = value.file;
    let cancelled = false;

    onChange({ ...valueRef.current, isParsingFile: true, fileParseError: null, parsedFileGeometry: null });

    parseGeometryFile(file)
      .then((result) => {
        if (cancelled) return;
        onChange({ ...valueRef.current, parsedFileGeometry: result.geometry, isParsingFile: false, fileParseError: null });
      })
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof ApiError ? err.message : "Не удалось прочитать файл.";
        onChange({ ...valueRef.current, parsedFileGeometry: null, isParsingFile: false, fileParseError: message });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- valueRef.current всегда актуален, value.file — единственная содержательная зависимость
  }, [value.file]);

  function patch(patchValue: Partial<SiteFieldsState>) {
    onChange({ ...value, ...patchValue });
  }

  function handleFileChange(file: File | null) {
    if (file) {
      patch({ file });
    } else {
      // Убрали файл — точка (если была) всплывает обратно как есть, её не трогаем.
      patch({ file: null, parsedFileGeometry: null, fileParseError: null, isParsingFile: false });
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <FormField
        id="site-point"
        label="Участок на карте"
        error={errors.geometry}
        hint={
          value.isParsingFile
            ? "Проверяем файл…"
            : value.parsedFileGeometry
              ? "Участок из файла — проверьте границы на карте."
              : "Кликните по карте, чтобы отметить участок, или приложите файл ниже."
        }
      >
        {value.isParsingFile ? (
          <MapLoadingPlaceholder />
        ) : value.parsedFileGeometry ? (
          <SiteMap geometry={value.parsedFileGeometry} />
        ) : (
          <MapPointPicker value={value.point} onChange={(point) => patch({ point })} hasError={Boolean(errors.geometry)} />
        )}
      </FormField>

      <FormField
        id="site-geometry-file"
        label="Файл участка (необязательно, если задана точка)"
        error={value.fileParseError ?? undefined}
        hint="KML или GeoJSON — если приложен и успешно прочитан, геометрия участка берётся из файла, точка на карте не используется."
      >
        <FilePicker
          id="site-geometry-file"
          file={value.file}
          onChange={handleFileChange}
          accept=".kml,.geojson,.json"
          buttonLabel="Загрузить файл"
        />
      </FormField>
    </div>
  );
}
