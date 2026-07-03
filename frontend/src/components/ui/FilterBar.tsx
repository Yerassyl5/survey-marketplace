"use client";

/* ────────────────────────────────────────────────────────────────────────
   FilterBar.tsx — фильтры ленты заявок: тип работ + каскадный фильтр
   локации (республиканские города / область → город|район области).
   Итоговый фильтр локации всегда конкретный city_id либо district_id —
   region_id как отдельный параметр не используется (см. docs/sessions).
   ──────────────────────────────────────────────────────────────────────── */

import { forwardRef, useMemo, useState } from "react";
import type { CSSProperties, SelectHTMLAttributes } from "react";

import { FormField } from "@/components/ui/FormField";
import { WORK_TYPE_LABELS } from "@/components/ui/RequestRow";
import type { GeoLocations } from "@/lib/api/geo";
import type { WorkType } from "@/lib/api/marketplace";

const WORK_TYPES = Object.keys(WORK_TYPE_LABELS) as WorkType[];

/* ── Select — стилизованный нативный <select>, как Input.tsx ─────────────── */
interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  hasError?: boolean;
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { hasError = false, style, ...props },
  ref,
) {
  const baseStyle: CSSProperties = {
    width: "100%",
    height: 40,
    padding: "0 12px",
    fontFamily: "var(--ds-font-body)",
    fontSize: 14,
    color: "var(--ds-text)",
    background: "var(--ds-bg-white)",
    border: `1px solid ${hasError ? "var(--ds-error)" : "var(--ds-border-str)"}`,
    borderRadius: "var(--ds-r-md)",
    outline: "none",
    cursor: "pointer",
    transition: "border-color 150ms, box-shadow 150ms",
  };
  return (
    <select
      ref={ref}
      style={{ ...baseStyle, ...style }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = hasError ? "var(--ds-error)" : "var(--ds-blue)";
        e.currentTarget.style.boxShadow = `0 0 0 3px ${hasError ? "var(--ds-error-bg)" : "var(--ds-blue-xlight)"}`;
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = hasError ? "var(--ds-error)" : "var(--ds-border-str)";
        e.currentTarget.style.boxShadow = "none";
        props.onBlur?.(e);
      }}
      {...props}
    />
  );
});

/* ── FilterBar ─────────────────────────────────────────────────────────── */
export interface FeedFilterValue {
  workType: string;
  cityId: number | null;
  districtId: number | null;
}

export interface FilterBarProps {
  locations: GeoLocations | null;
  value: FeedFilterValue;
  onChange: (next: FeedFilterValue) => void;
  hasActiveFilters: boolean;
  onReset: () => void;
}

function encodeCity(id: number): string {
  return `city:${id}`;
}
function encodeDistrict(id: number): string {
  return `district:${id}`;
}

export function FilterBar({ locations, value, onChange, hasActiveFilters, onReset }: FilterBarProps) {
  const { workType, cityId, districtId } = value;

  // Разворачиваем текущий city_id/district_id обратно в область — чтобы
  // при заходе по прямой ссылке (deep-link) селекты сразу показывали
  // правильную область и город/район, а не «Все локации».
  const resolved = useMemo(() => {
    if (!locations) return { level1: "", level2: "", regionId: null as number | null };
    if (cityId != null) {
      if (locations.republican_cities.some((c) => c.id === cityId)) {
        return { level1: encodeCity(cityId), level2: "", regionId: null };
      }
      const region = locations.regions.find((r) => r.cities.some((c) => c.id === cityId));
      if (region) return { level1: `region:${region.id}`, level2: encodeCity(cityId), regionId: region.id };
    }
    if (districtId != null) {
      const region = locations.regions.find((r) => r.districts.some((d) => d.id === districtId));
      if (region) {
        return { level1: `region:${region.id}`, level2: encodeDistrict(districtId), regionId: region.id };
      }
    }
    return { level1: "", level2: "", regionId: null };
  }, [locations, cityId, districtId]);

  // Область, выбранную на уровне 1, но для которой ещё не выбран
  // город/район (уровень 2) — держим локально, это не часть URL/фильтра.
  // Синхронизация с resolved.regionId — во время рендера (react.dev:
  // «Adjusting state when a prop changes»), не через useEffect: иначе
  // это лишний цикл рендера ради значения, которое уже известно сейчас.
  const [pendingRegionId, setPendingRegionId] = useState<number | null>(resolved.regionId);
  const [lastResolvedRegionId, setLastResolvedRegionId] = useState<number | null>(resolved.regionId);
  if (resolved.regionId !== lastResolvedRegionId) {
    setLastResolvedRegionId(resolved.regionId);
    setPendingRegionId(resolved.regionId);
  }

  const activeRegionId = pendingRegionId ?? resolved.regionId;
  const activeRegion = locations?.regions.find((r) => r.id === activeRegionId) ?? null;
  const level2Value = activeRegionId === resolved.regionId ? resolved.level2 : "";

  function handleLevel1Change(raw: string) {
    if (raw === "") {
      setPendingRegionId(null);
      onChange({ workType, cityId: null, districtId: null });
      return;
    }
    const [kind, idStr] = raw.split(":");
    const id = Number(idStr);
    if (kind === "city") {
      setPendingRegionId(null);
      onChange({ workType, cityId: id, districtId: null });
    } else {
      setPendingRegionId(id);
      onChange({ workType, cityId: null, districtId: null });
    }
  }

  function handleLevel2Change(raw: string) {
    if (raw === "") {
      onChange({ workType, cityId: null, districtId: null });
      return;
    }
    const [kind, idStr] = raw.split(":");
    const id = Number(idStr);
    onChange({ workType, cityId: kind === "city" ? id : null, districtId: kind === "district" ? id : null });
  }

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "flex-end",
        gap: 16,
        padding: 20,
        background: "var(--ds-bg-white)",
        border: "1px solid var(--ds-border)",
        borderRadius: "var(--ds-r-lg)",
      }}
    >
      <div style={{ minWidth: 200, flex: "1 1 200px" }}>
        <FormField id="filter-work-type" label="Тип работ">
          <Select value={workType} onChange={(e) => onChange({ workType: e.target.value, cityId, districtId })}>
            <option value="">Все типы</option>
            {WORK_TYPES.map((wt) => (
              <option key={wt} value={wt}>
                {WORK_TYPE_LABELS[wt]}
              </option>
            ))}
          </Select>
        </FormField>
      </div>

      <div style={{ minWidth: 220, flex: "1 1 220px" }}>
        <FormField id="filter-location" label="Локация">
          <Select
            value={resolved.level1}
            onChange={(e) => handleLevel1Change(e.target.value)}
            disabled={!locations}
          >
            <option value="">{locations ? "Все локации" : "Загрузка справочника…"}</option>
            {locations && locations.republican_cities.length > 0 && (
              <optgroup label="Города республиканского значения">
                {locations.republican_cities.map((c) => (
                  <option key={c.id} value={encodeCity(c.id)}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            )}
            {locations && (
              <optgroup label="Области">
                {locations.regions.map((r) => (
                  <option key={r.id} value={`region:${r.id}`}>
                    {r.name}
                  </option>
                ))}
              </optgroup>
            )}
          </Select>
        </FormField>
      </div>

      {activeRegion && (
        <div style={{ minWidth: 220, flex: "1 1 220px" }}>
          <FormField id="filter-location-leaf" label={`Город/район — ${activeRegion.name}`}>
            <Select value={level2Value} onChange={(e) => handleLevel2Change(e.target.value)}>
              <option value="">Выберите город или район</option>
              {activeRegion.cities.length > 0 && (
                <optgroup label="Города">
                  {activeRegion.cities.map((c) => (
                    <option key={c.id} value={encodeCity(c.id)}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {activeRegion.districts.length > 0 && (
                <optgroup label="Районы">
                  {activeRegion.districts.map((d) => (
                    <option key={d.id} value={encodeDistrict(d.id)}>
                      {d.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </Select>
          </FormField>
        </div>
      )}

      {hasActiveFilters && (
        <button
          type="button"
          onClick={onReset}
          style={{
            height: 40,
            padding: "0 16px",
            background: "transparent",
            border: "1px solid var(--ds-border-str)",
            borderRadius: "var(--ds-r-md)",
            fontFamily: "var(--ds-font-body)",
            fontSize: 13,
            fontWeight: 500,
            color: "var(--ds-text-sec)",
            cursor: "pointer",
            transition: "border-color 150ms, color 150ms",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--ds-blue)";
            e.currentTarget.style.color = "var(--ds-blue)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--ds-border-str)";
            e.currentTarget.style.color = "var(--ds-text-sec)";
          }}
        >
          Сбросить фильтры
        </button>
      )}
    </div>
  );
}
