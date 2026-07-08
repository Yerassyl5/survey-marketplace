"use client";

/* ────────────────────────────────────────────────────────────────────────
   useBasemap.ts — стейт переключателя подложки. Не владеет картой: получает
   снаружи mapRef/isLoaded уже существующего инстанса MapLibre (MapPointPicker.tsx
   и SiteMap.tsx создают карту по-разному и в разное время), только применяет
   выбор через setBasemap() из basemaps.ts.

   Опциональный `controlled` — на случай, когда состояние должно пережить сам
   компонент: SiteFields.tsx рендерит MapPointPicker и SiteMap ВЗАИМОИСКЛЮЧАЮЩЕ
   (точка на карте, пока нет файла → геометрия из файла), это разные React-
   деревья, свой internal useState не пережил бы переключение. Без controlled —
   обычное несвязанное состояние (например, SiteMap на странице заявки, где
   MapPointPicker вообще нет).
   ──────────────────────────────────────────────────────────────────────── */

import { useEffect, useState } from "react";
import type { RefObject } from "react";
import type maplibregl from "maplibre-gl";

import { DEFAULT_BASEMAP, setBasemap } from "@/components/ui/basemaps";
import type { BasemapId } from "@/components/ui/basemaps";

export interface BasemapControl {
  value: BasemapId;
  onChange: (id: BasemapId) => void;
}

export function useBasemap(
  mapRef: RefObject<maplibregl.Map | null>,
  isLoaded: boolean,
  controlled?: BasemapControl,
) {
  const [internalBasemap, setInternalBasemap] = useState<BasemapId>(DEFAULT_BASEMAP);
  const basemap = controlled?.value ?? internalBasemap;
  const setBasemapState = controlled?.onChange ?? setInternalBasemap;

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoaded) return;
    setBasemap(map, basemap);
    // mapRef — стабильный объект (useRef), не нужен в зависимостях; тот же
    // паттерн, что синхронизация маркера в MapPointPicker.tsx.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basemap, isLoaded]);

  return [basemap, setBasemapState] as const;
}
