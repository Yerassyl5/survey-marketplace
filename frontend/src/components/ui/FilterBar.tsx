"use client";

/* ────────────────────────────────────────────────────────────────────────
   FilterBar.tsx — фильтры ленты заявок: тип работ + каскадный фильтр
   локации (переиспользует LocationCascadeSelect, allowEmpty=true — есть
   опция «Все локации», без валидации). Итоговый фильтр локации всегда
   конкретный city_id либо district_id — region_id как отдельный параметр
   не используется (см. docs/sessions).
   ──────────────────────────────────────────────────────────────────────── */

import { FormField } from "@/components/ui/FormField";
import { LocationCascadeSelect } from "@/components/ui/LocationCascadeSelect";
import { Select } from "@/components/ui/Select";
import { WORK_TYPE_LABELS } from "@/components/ui/RequestRow";
import type { GeoLocations } from "@/lib/api/geo";
import type { WorkType } from "@/lib/api/marketplace";

const WORK_TYPES = Object.keys(WORK_TYPE_LABELS) as WorkType[];

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

export function FilterBar({ locations, value, onChange, hasActiveFilters, onReset }: FilterBarProps) {
  const { workType, cityId, districtId } = value;

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

      <LocationCascadeSelect
        locations={locations}
        value={{ cityId, districtId }}
        onChange={(next) => onChange({ workType, ...next })}
        allowEmpty
        idPrefix="filter"
      />

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
