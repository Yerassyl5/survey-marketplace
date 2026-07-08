"use client";

/* ────────────────────────────────────────────────────────────────────────
   MapPointPicker.tsx — интерактивная точка на карте (MapLibre GL JS): клик
   ставит/двигает маркер, наружу отдаётся {lng, lat}. В отличие от SiteMap.tsx
   (только чтение уже готовой геометрии), этот компонент — ввод: обязательная
   базовая геометрия нового объекта (Site.geometry — NOT NULL в БД). Точный
   контур поверх неё можно уточнить файлом (см. SiteFields.tsx) — точка не
   вкладка-альтернатива, а всегда обязательный якорь.
   ──────────────────────────────────────────────────────────────────────── */

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { BasemapSwitcher } from "@/components/ui/BasemapSwitcher";
import { buildBasemapStyle } from "@/components/ui/basemaps";
import type { BasemapId } from "@/components/ui/basemaps";
import { useBasemap } from "@/components/ui/useBasemap";

const KAZAKHSTAN_CENTER: [number, number] = [71.4, 51.1];

export interface LngLat {
  lng: number;
  lat: number;
}

export interface MapPointPickerProps {
  value: LngLat | null;
  onChange: (point: LngLat) => void;
  height?: number;
  hasError?: boolean;
  /** Подложка — передавать вместе с onBasemapChange, если выбор должен
   * пережить этот компонент (см. useBasemap.ts). Без обоих — своё состояние. */
  basemap?: BasemapId;
  onBasemapChange?: (id: BasemapId) => void;
}

export function MapPointPicker({
  value,
  onChange,
  height = 320,
  hasError = false,
  basemap: controlledBasemap,
  onBasemapChange,
}: MapPointPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  // onChange меняется на каждый рендер родителя (инлайн-колбэк) — держим
  // актуальную ссылку в ref (обновляется в эффекте, не во время рендера —
  // react-hooks/refs запрещает мутацию ref в теле рендера), чтобы не
  // пересоздавать карту/обработчик клика.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  const [isLoaded, setIsLoaded] = useState(false);
  const [basemap, setBasemap] = useBasemap(
    mapRef,
    isLoaded,
    controlledBasemap !== undefined && onBasemapChange ? { value: controlledBasemap, onChange: onBasemapChange } : undefined,
  );

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildBasemapStyle(),
      center: value ? [value.lng, value.lat] : KAZAKHSTAN_CENTER,
      zoom: value ? 13 : 4,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("click", (e) => onChangeRef.current({ lng: e.lngLat.lng, lat: e.lngLat.lat }));
    map.on("load", () => {
      if (!cancelled) setIsLoaded(true);
    });
    mapRef.current = map;

    return () => {
      cancelled = true;
      mapRef.current = null;
      map.remove();
    };
    // Карта создаётся один раз при монтировании; начальное value учтено в
    // center/zoom выше. Дальнейшая синхронизация — через маркер отдельным
    // эффектом ниже, без пересоздания карты на каждый клик.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoaded) return;
    if (!value) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    if (markerRef.current) {
      markerRef.current.setLngLat([value.lng, value.lat]);
    } else {
      markerRef.current = new maplibregl.Marker({ color: "#0369A1" }).setLngLat([value.lng, value.lat]).addTo(map);
    }
  }, [value, isLoaded]);

  const wrapperStyle: CSSProperties = {
    position: "relative",
    height,
    borderRadius: "var(--ds-r-lg)",
    overflow: "hidden",
    border: `1px solid ${hasError ? "var(--ds-error)" : "var(--ds-border)"}`,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={wrapperStyle}>
        <div ref={containerRef} style={{ width: "100%", height: "100%", cursor: "crosshair" }} />
        <BasemapSwitcher value={basemap} onChange={setBasemap} />
        {!isLoaded && (
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
      <p style={{ fontFamily: "var(--ds-font-body)", fontSize: 12, color: "var(--ds-text-muted)", margin: 0 }}>
        {value
          ? `Точка указана: ${value.lat.toFixed(5)}, ${value.lng.toFixed(5)} — кликните ещё раз, чтобы передвинуть.`
          : "Кликните по карте, чтобы указать местоположение объекта."}
      </p>
    </div>
  );
}
