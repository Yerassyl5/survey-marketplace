"use client";

/* ────────────────────────────────────────────────────────────────────────
   useBasemap.ts — стейт переключателя подложки. Не владеет картой: получает
   снаружи mapRef/isLoaded уже существующего инстанса MapLibre (MapPointPicker.tsx
   и SiteMap.tsx создают карту по-разному и в разное время), только применяет
   выбор через setBasemap() из basemaps.ts.
   ──────────────────────────────────────────────────────────────────────── */

import { useEffect, useState } from "react";
import type { RefObject } from "react";
import type maplibregl from "maplibre-gl";

import { DEFAULT_BASEMAP, setBasemap } from "@/components/ui/basemaps";
import type { BasemapId } from "@/components/ui/basemaps";

export function useBasemap(mapRef: RefObject<maplibregl.Map | null>, isLoaded: boolean) {
  const [basemap, setBasemapState] = useState<BasemapId>(DEFAULT_BASEMAP);

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
