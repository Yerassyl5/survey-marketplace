/* ────────────────────────────────────────────────────────────────────────
   basemaps.ts — общий модуль подложек карты (MapLibre) для MapPointPicker.tsx
   и SiteMap.tsx: один style с двумя raster-слоями (OSM/Esri), переключение
   ТОЛЬКО через setLayoutProperty(visibility) — map.setStyle() снёс бы уже
   добавленные слои геометрии/маркера, поэтому не используется.
   ──────────────────────────────────────────────────────────────────────── */

import type maplibregl from "maplibre-gl";

export type BasemapId = "osm" | "satellite";

export const BASEMAP_LABELS: Record<BasemapId, string> = {
  osm: "Схема",
  satellite: "Спутник",
};

export const DEFAULT_BASEMAP: BasemapId = "osm";

export const OSM_LAYER_ID = "basemap-osm";
export const SATELLITE_LAYER_ID = "basemap-satellite";

const OSM_SOURCE_ID = "basemap-osm-tiles";
const SATELLITE_SOURCE_ID = "basemap-satellite-tiles";

export function buildBasemapStyle(): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {
      [OSM_SOURCE_ID]: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
      },
      // Порядок осей у Esri в пути тайла — {z}/{y}/{x}, не {z}/{x}/{y} как у OSM.
      // Attribution — дословно из World_Imagery/MapServer?f=json (copyrightText),
      // не придумана: обязательное условие использования без API-ключа.
      [SATELLITE_SOURCE_ID]: {
        type: "raster",
        tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
        tileSize: 256,
        attribution: "Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community",
      },
    },
    layers: [
      { id: OSM_LAYER_ID, type: "raster", source: OSM_SOURCE_ID },
      {
        id: SATELLITE_LAYER_ID,
        type: "raster",
        source: SATELLITE_SOURCE_ID,
        layout: { visibility: "none" },
      },
    ],
  };
}

/** Единственное место, переключающее подложку — видимость слоя, слои/источники
 * не пересоздаются, геометрия/маркер поверх них не теряются. */
export function setBasemap(map: maplibregl.Map, id: BasemapId): void {
  map.setLayoutProperty(OSM_LAYER_ID, "visibility", id === "osm" ? "visible" : "none");
  map.setLayoutProperty(SATELLITE_LAYER_ID, "visibility", id === "satellite" ? "visible" : "none");
}
