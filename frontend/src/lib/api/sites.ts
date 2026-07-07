/* ────────────────────────────────────────────────────────────────────────
   Объекты (Site) заказчика — GET/POST /api/sites/, POST /api/sites/{id}/geometry/.
   SiteSerializer — GeoFeatureModelSerializer: список оборачивается в
   FeatureCollection, отдельный объект — в Feature ({type, geometry,
   properties: {owner, ...}}). В отличие от marketplace (bare-геометрия) —
   здесь всегда GeoJSON Feature-обёртка.
   Упрощено 2026-07-07: address/cadastral_number убраны из модели — Site
   больше не переиспользуется между заявками, участок определяется только
   геометрией (см. SiteFields.tsx — форма всегда создаёт новый Site).
   ──────────────────────────────────────────────────────────────────────── */

import { apiFetch } from "./client";

export interface SiteProperties {
  owner: number;
  created_at: string;
  updated_at: string;
}

export interface Site {
  id: number;
  type: "Feature";
  geometry: GeoJSON.Geometry;
  properties: SiteProperties;
}

interface SiteFeatureCollection {
  type: "FeatureCollection";
  features: Site[];
}

export interface SiteCreatePayload {
  geometry: GeoJSON.Geometry;
}

export async function getSites(): Promise<Site[]> {
  const data = await apiFetch<SiteFeatureCollection>("/sites/");
  return data.features;
}

export async function createSite(payload: SiteCreatePayload): Promise<Site> {
  return apiFetch<Site>("/sites/", {
    method: "POST",
    body: JSON.stringify({
      type: "Feature",
      geometry: payload.geometry,
      properties: {},
    }),
  });
}

/** Уточняет геометрию уже созданного объекта файлом (KML/GeoJSON, ≤10 МБ) —
 * заменяет геометрию, переданную при создании (обычно приблизительную точку). */
export async function uploadSiteGeometry(siteId: number, file: File): Promise<void> {
  const formData = new FormData();
  formData.append("file", file);
  await apiFetch<{ detail: string; format: string }>(`/sites/${siteId}/geometry/`, {
    method: "POST",
    body: formData,
  });
}
