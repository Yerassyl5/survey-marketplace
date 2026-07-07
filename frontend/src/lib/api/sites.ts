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

/** Дозаписывает геометрию файлом (KML/GeoJSON, ≤10 МБ) в УЖЕ существующий
 * Site — заменяет то, что было. Форма создания заявки (SiteFields.tsx) этим
 * больше не пользуется (2026-07-08: файл теперь парсится ДО создания Site
 * через parseGeometryFile(), Site создаётся сразу с финальной геометрией,
 * без промежуточного шага дозаписи) — оставлено как рабочий, но сейчас
 * невостребованный биндинг над POST /api/sites/{id}/geometry/ (бэкенд не
 * менялся) на случай будущего сценария «уточнить геометрию уже созданного
 * объекта».
 * @deprecated не используется формой создания заявки, см. комментарий выше.
 */
export async function uploadSiteGeometry(siteId: number, file: File): Promise<void> {
  const formData = new FormData();
  formData.append("file", file);
  await apiFetch<{ detail: string; format: string }>(`/sites/${siteId}/geometry/`, {
    method: "POST",
    body: formData,
  });
}

export interface ParseGeometryResult {
  geometry: GeoJSON.Geometry;
  format: "kml" | "geojson";
}

/** POST /api/geo/parse-geometry/ — бесстейтовый эндпоинт geo-приложения (не
 * sites), объявлен здесь, а не в geo.ts, потому что используется только
 * формой создания заявки (SiteFields.tsx) рядом с createSite/uploadSiteGeometry.
 * Парсит файл (KML/GeoJSON) и возвращает готовую геометрию в WGS84, НИЧЕГО
 * не сохраняя — так форма получает финальную геометрию ДО создания Site и
 * не нуждается во временной точке-заглушке. Ошибки парсинга (400) приходят
 * как {"detail": "..."} — apiFetch извлекает это в ApiError.message. */
export async function parseGeometryFile(file: File): Promise<ParseGeometryResult> {
  const formData = new FormData();
  formData.append("file", file);
  return apiFetch<ParseGeometryResult>("/geo/parse-geometry/", {
    method: "POST",
    body: formData,
  });
}
