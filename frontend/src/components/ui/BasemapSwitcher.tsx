"use client";

/* ────────────────────────────────────────────────────────────────────────
   BasemapSwitcher.tsx — дропдаун «Схема/Спутник» поверх карты (top-left —
   top-right занят NavigationControl). Чисто презентационный, переиспользует
   стилизованный Select.
   ──────────────────────────────────────────────────────────────────────── */

import type { CSSProperties } from "react";

import { Select } from "@/components/ui/Select";
import { BASEMAP_LABELS } from "@/components/ui/basemaps";
import type { BasemapId } from "@/components/ui/basemaps";

export interface BasemapSwitcherProps {
  value: BasemapId;
  onChange: (id: BasemapId) => void;
}

const wrapperStyle: CSSProperties = {
  position: "absolute",
  top: 8,
  left: 8,
  width: 130,
  zIndex: "var(--ds-z-base)" as CSSProperties["zIndex"],
};

export function BasemapSwitcher({ value, onChange }: BasemapSwitcherProps) {
  return (
    <div style={wrapperStyle}>
      <Select value={value} onChange={(e) => onChange(e.target.value as BasemapId)} aria-label="Подложка карты">
        {(Object.keys(BASEMAP_LABELS) as BasemapId[]).map((id) => (
          <option key={id} value={id}>
            {BASEMAP_LABELS[id]}
          </option>
        ))}
      </Select>
    </div>
  );
}
