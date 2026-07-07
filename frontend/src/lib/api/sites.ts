/* ────────────────────────────────────────────────────────────────────────
   Объекты (Site) заказчика — GET/POST /api/sites/, POST /api/sites/{id}/geometry/.
   SiteSerializer — GeoFeatureModelSerializer: список оборачивается в
   FeatureCollection, отдельный объект — в Feature ({type, geometry,
   properties: {address, cadastral_number, owner, ...}}). В отличие от
   marketplace (bare-геометрия) — здесь всегда GeoJSON Feature-обёртка.
   ──────────────────────────────────────────────────────────────────────── */

import { apiFetch } from "./client";

export interface SiteProperties {
  address: string;
  cadastral_number: string;
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
  address: string;
  cadastral_number?: string;
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
      properties: {
        address: payload.address,
        cadastral_number: payload.cadastral_number ?? "",
      },
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
