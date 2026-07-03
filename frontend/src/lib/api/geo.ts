/* ────────────────────────────────────────────────────────────────────────
   Справочник КАТО (области/районы/города) — GET /api/geo/locations/.
   Датасет маленький и почти статичный, отдаётся одним деревом (см.
   backend/apps/geo/views.py — GeoLocationsView), фронт запрашивает раз
   и строит каскадный фильтр локации на клиенте.
   ──────────────────────────────────────────────────────────────────────── */

import { apiFetch } from "./client";

export interface GeoCity {
  id: number;
  name: string;
}

export interface GeoDistrict {
  id: number;
  name: string;
}

export interface GeoRegion {
  id: number;
  name: string;
  cities: GeoCity[];
  districts: GeoDistrict[];
}

export interface GeoLocations {
  republican_cities: GeoCity[];
  regions: GeoRegion[];
}

export async function getLocations(): Promise<GeoLocations> {
  return apiFetch<GeoLocations>("/geo/locations/");
}
