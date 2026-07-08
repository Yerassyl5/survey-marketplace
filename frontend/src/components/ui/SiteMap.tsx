"use client";

/* ────────────────────────────────────────────────────────────────────────
   SiteMap.tsx — геометрия объекта на карте (MapLibre GL JS).
   Принимает ГОЛУЮ GeoJSON-геометрию (bare Geometry, не Feature) — бэкенд
   отдаёт её напрямую через rest_framework_gis GeometryField, без обёртки
   {type:"Feature", geometry:{...}, properties:{...}} (в отличие от
   sites.SiteSerializer, который строит целый Feature).
   Generic-компонент — не привязан к marketplace-типам.
   ──────────────────────────────────────────────────────────────────────── */

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { BasemapSwitcher } from "@/components/ui/BasemapSwitcher";
import { buildBasemapStyle } from "@/components/ui/basemaps";
import { useBasemap } from "@/components/ui/useBasemap";

// TODO(прод): тайлы OSM (tile.openstreetmap.org) напрямую — их usage policy
// не разрешает продакшн-трафик без отдельного разрешения. При выходе на
// реальных пользователей переключить на self-hosted тайл-сервер или
// платного провайдера (MapTiler и т.п.). Для dev/демо — ок, без внешних ключей.

function collectCoordinates(coords: unknown, out: [number, number][]): void {
  if (Array.isArray(coords) && typeof coords[0] === "number") {
    out.push(coords as [number, number]);
  } else if (Array.isArray(coords)) {
    for (const c of coords) collectCoordinates(c, out);
  }
}

function computeBounds(geometry: GeoJSON.Geometry): maplibregl.LngLatBoundsLike | null {
  if (geometry.type === "GeometryCollection") return null;
  const coords: [number, number][] = [];
  collectCoordinates(geometry.coordinates, coords);
  if (coords.length === 0) return null;
  const lons = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  return [
    [Math.min(...lons), Math.min(...lats)],
    [Math.max(...lons), Math.max(...lats)],
  ];
}

const placeholderStyle = (height: number): CSSProperties => ({
  height,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "var(--ds-bg)",
  border: "1px solid var(--ds-border)",
  borderRadius: "var(--ds-r-lg)",
  color: "var(--ds-text-muted)",
  fontFamily: "var(--ds-font-body)",
  fontSize: 13,
});

export interface SiteMapProps {
  geometry: GeoJSON.Geometry | null;
  height?: number;
}

export function SiteMap({ geometry, height = 320 }: SiteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  // "Загружено" — производное сравнение с последней отрисованной геометрией,
  // не отдельный setState("loading") в теле эффекта (react-hooks/set-state-
  // in-effect): та же схема, что requestKey на /feed.
  const [loadedGeometry, setLoadedGeometry] = useState<GeoJSON.Geometry | null>(null);
  // Отдельное состояние (не просто catch → placeholder "нет геометрии"):
  // геометрия ЕСТЬ, она просто не в WGS84-градусах (MapLibre кидает
  // "Invalid LngLat latitude value" в fitBounds на координатах вроде
  // 5795889 из-за не-репроецированного файла) — сообщение не должно врать,
  // что геометрии не было вовсе.
  const [invalidGeometry, setInvalidGeometry] = useState<GeoJSON.Geometry | null>(null);
  const isInvalidGeometry = geometry !== null && invalidGeometry === geometry;
  const isMapLoading = geometry !== null && loadedGeometry !== geometry && !isInvalidGeometry;
  // Стиль (включая оба raster-слоя подложки) считается загруженным ровно
  // тогда же, когда завершился обработчик 'load' — тем же признаком, что уже
  // есть (loadedGeometry/invalidGeometry устанавливаются синхронно внутри
  // него), без отдельного setState специально под это.
  const isStyleLoaded = loadedGeometry === geometry || isInvalidGeometry;
  const [basemap, setBasemap] = useBasemap(mapRef, isStyleLoaded);

  useEffect(() => {
    if (!containerRef.current || !geometry) return;

    // StrictMode в dev монтирует эффект дважды (mount → cleanup → mount).
    // Если 'load' сработал уже после cleanup (map.remove() вызван) —
    // не трогаем удалённую карту.
    let cancelled = false;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildBasemapStyle(),
      center: [71.4, 51.1], // фолбэк-центр (Казахстан) — перезаписывается fitBounds ниже
      zoom: 3,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    map.on("load", () => {
      if (cancelled) return;

      try {
        map.addSource("site-geometry", { type: "geojson", data: geometry });

        if (geometry.type === "Point") {
          map.addLayer({
            id: "site-point",
            type: "circle",
            source: "site-geometry",
            paint: {
              "circle-radius": 8,
              "circle-color": "#0369A1",
              "circle-stroke-width": 2,
              "circle-stroke-color": "#FFFFFF",
            },
          });
        } else {
          map.addLayer({
            id: "site-fill",
            type: "fill",
            source: "site-geometry",
            paint: { "fill-color": "#0369A1", "fill-opacity": 0.15 },
          });
          map.addLayer({
            id: "site-line",
            type: "line",
            source: "site-geometry",
            paint: { "line-color": "#0369A1", "line-width": 2 },
          });
        }

        const bounds = computeBounds(geometry);
        if (bounds) {
          map.fitBounds(bounds, { padding: 40, maxZoom: 16, duration: 0 });
        }

        setLoadedGeometry(geometry);
      } catch (err) {
        // Координаты геометрии физически некорректны для карты (не
        // WGS84-градусы — например, не репроецированный файл с метрами) —
        // MapLibre кидает исключение синхронно из fitBounds/LngLat. Ловим,
        // чтобы не ронять страницу, и показываем отдельное состояние.
        console.error("SiteMap: некорректные координаты геометрии", err);
        setInvalidGeometry(geometry);
      }
    });

    return () => {
      cancelled = true;
      mapRef.current = null;
      map.remove();
    };
  }, [geometry]);

  if (!geometry) {
    return <div style={placeholderStyle(height)}>Геометрия объекта не загружена</div>;
  }

  return (
    <div
      style={{
        position: "relative",
        height,
        borderRadius: "var(--ds-r-lg)",
        overflow: "hidden",
        border: "1px solid var(--ds-border)",
      }}
    >
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      <BasemapSwitcher value={basemap} onChange={setBasemap} />
      {isInvalidGeometry && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--ds-bg)",
            fontFamily: "var(--ds-font-body)",
            fontSize: 13,
            color: "var(--ds-text-muted)",
          }}
        >
          Некорректные координаты объекта
        </div>
      )}
      {isMapLoading && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--ds-bg)",
            fontFamily: "var(--ds-font-body)",
            fontSize: 13,
            color: "var(--ds-text-muted)",
          }}
        >
          Карта загружается…
        </div>
      )}
    </div>
  );
}
