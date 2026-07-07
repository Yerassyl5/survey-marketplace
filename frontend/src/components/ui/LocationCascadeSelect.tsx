"use client";

/* ────────────────────────────────────────────────────────────────────────
   LocationCascadeSelect.tsx — каскадный выбор локации (республиканский
   город / область → город|район области), вынесен из FilterBar.tsx —
   переиспользуется формой создания заявки (обязательный выбор, allowEmpty
   =false) и фильтром ленты (allowEmpty=true, доп. опция «Все локации»).
   Итоговое значение — всегда конкретный cityId ЛИБО districtId, как и было
   в FilterBar (regionId наружу не отдаётся, это только промежуточный шаг
   каскада).
   ──────────────────────────────────────────────────────────────────────── */

import { useMemo, useState } from "react";

import { FormField } from "@/components/ui/FormField";
import { Select } from "@/components/ui/Select";
import type { GeoLocations } from "@/lib/api/geo";

export interface LocationValue {
  cityId: number | null;
  districtId: number | null;
}

export interface LocationCascadeSelectProps {
  locations: GeoLocations | null;
  value: LocationValue;
  onChange: (next: LocationValue) => void;
  /** true — лента: есть опция «Все локации», без валидации.
   * false — форма: выбор обязателен, показывается error. */
  allowEmpty: boolean;
  /** Только при allowEmpty=false — сообщение под тем из двух select'ов,
   * который сейчас актуален (второй уровень, если область уже выбрана). */
  error?: string;
  /** Уникальный префикс id полей — на случай нескольких инстансов на странице. */
  idPrefix: string;
}

function encodeCity(id: number): string {
  return `city:${id}`;
}
function encodeDistrict(id: number): string {
  return `district:${id}`;
}

export function LocationCascadeSelect({
  locations,
  value,
  onChange,
  allowEmpty,
  error,
  idPrefix,
}: LocationCascadeSelectProps) {
  const { cityId, districtId } = value;

  // Разворачиваем текущий cityId/districtId обратно в область — чтобы при
  // готовом значении (deep-link ленты, или редактирование формы) селекты
  // сразу показывали правильную область и город/район, а не «Все локации».
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
  // город/район (уровень 2) — держим локально, это не часть внешнего value.
  // Синхронизация с resolved.regionId — во время рендера (react.dev:
  // «Adjusting state when a prop changes»), не через useEffect.
  const [pendingRegionId, setPendingRegionId] = useState<number | null>(resolved.regionId);
  const [lastResolvedRegionId, setLastResolvedRegionId] = useState<number | null>(resolved.regionId);
  if (resolved.regionId !== lastResolvedRegionId) {
    setLastResolvedRegionId(resolved.regionId);
    setPendingRegionId(resolved.regionId);
  }

  const activeRegionId = pendingRegionId ?? resolved.regionId;
  const activeRegion = locations?.regions.find((r) => r.id === activeRegionId) ?? null;
  const level2Value = activeRegionId === resolved.regionId ? resolved.level2 : "";

  // Ошибка показывается ровно под одним select'ом — под level2, если область
  // уже выбрана (там сейчас нужно действие), иначе под level1.
  const level1Error = !allowEmpty && !activeRegion ? error : undefined;
  const level2Error = !allowEmpty && activeRegion ? error : undefined;

  function handleLevel1Change(raw: string) {
    if (raw === "") {
      setPendingRegionId(null);
      onChange({ cityId: null, districtId: null });
      return;
    }
    const [kind, idStr] = raw.split(":");
    const id = Number(idStr);
    if (kind === "city") {
      setPendingRegionId(null);
      onChange({ cityId: id, districtId: null });
    } else {
      setPendingRegionId(id);
      onChange({ cityId: null, districtId: null });
    }
  }

  function handleLevel2Change(raw: string) {
    if (raw === "") {
      onChange({ cityId: null, districtId: null });
      return;
    }
    const [kind, idStr] = raw.split(":");
    const id = Number(idStr);
    onChange({ cityId: kind === "city" ? id : null, districtId: kind === "district" ? id : null });
  }

  return (
    <>
      <div style={{ minWidth: 220, flex: "1 1 220px" }}>
        <FormField
          id={`${idPrefix}-location`}
          label="Локация"
          required={!allowEmpty}
          error={level1Error}
        >
          <Select
            value={resolved.level1}
            onChange={(e) => handleLevel1Change(e.target.value)}
            disabled={!locations}
            hasError={Boolean(level1Error)}
          >
            <option value="">
              {!locations ? "Загрузка справочника…" : allowEmpty ? "Все локации" : "Выберите область или город"}
            </option>
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
          <FormField
            id={`${idPrefix}-location-leaf`}
            label={`Город/район — ${activeRegion.name}`}
            required={!allowEmpty}
            error={level2Error}
          >
            <Select value={level2Value} onChange={(e) => handleLevel2Change(e.target.value)} hasError={Boolean(level2Error)}>
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
    </>
  );
}
