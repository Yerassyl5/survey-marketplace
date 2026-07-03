/* ────────────────────────────────────────────────────────────────────────
   Типы и запросы marketplace API. Списаны с backend/apps/marketplace/
   {models,serializers}.py — держать в синхроне при изменении бэкенда.
   ──────────────────────────────────────────────────────────────────────── */

import { apiFetch } from "./client";

export type WorkType = "geodesy" | "geology" | "geophysics" | "ecology" | "other";
export type LocationType = "city" | "district";

export interface CustomerBrief {
  id: number;
  full_name: string;
  organization_name: string;
}

/** Заявка в ленте исполнителя — RequestFeedSerializer (открытые заявки, без bids_count/status). */
export interface FeedRequest {
  id: number;
  site: number;
  work_type: WorkType;
  description: string;
  tz_file: string | null;
  location_type: LocationType;
  city: number | null;
  district: number | null;
  location_display: string;
  customer: CustomerBrief;
  created_at: string;
  updated_at: string;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface FeedFilters {
  work_type?: string;
  city_id?: number;
  district_id?: number;
  page?: number;
}

export async function getFeed(filters: FeedFilters = {}): Promise<PaginatedResponse<FeedRequest>> {
  const params = new URLSearchParams();
  if (filters.work_type) params.set("work_type", filters.work_type);
  if (filters.city_id != null) params.set("city_id", String(filters.city_id));
  if (filters.district_id != null) params.set("district_id", String(filters.district_id));
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));

  const qs = params.toString();
  return apiFetch<PaginatedResponse<FeedRequest>>(`/marketplace/requests/${qs ? `?${qs}` : ""}`);
}
