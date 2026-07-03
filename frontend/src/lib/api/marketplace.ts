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
  /** Уточняющая геометрия ЗАЯВКИ (необязательна) — голая GeoJSON-геометрия
   * (bare GeometryField на бэкенде), НЕ Feature. Обычно null — участок уже
   * описан геометрией Site (см. FeedRequestDetail.site_geometry). */
  geometry: GeoJSON.Geometry | null;
  location_type: LocationType;
  city: number | null;
  district: number | null;
  location_display: string;
  customer: CustomerBrief;
  /** Уже откликался ли текущий исполнитель на эту заявку (аннотация Exists() на бэкенде). */
  has_bid: boolean;
  created_at: string;
  updated_at: string;
}

/** Детали заявки — RequestFeedDetailSerializer (только GET одной заявки,
 * не список). site_geometry — тоже голая GeoJSON-геометрия, не Feature:
 * в отличие от sites.SiteSerializer (GeoFeatureModelSerializer), тут нет
 * обёртки {type:"Feature", geometry:{...}, properties:{...}}. */
export interface FeedRequestDetail extends FeedRequest {
  site_geometry: GeoJSON.Geometry | null;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/** Ответ ленты — та же пагинация + today_count (заявки, созданные сегодня,
 * посчитаны по тем же фильтрам, что и count; см. RequestPagination.get_paginated_response). */
export interface FeedResponse extends PaginatedResponse<FeedRequest> {
  today_count: number;
}

export interface FeedFilters {
  work_type?: string;
  city_id?: number;
  district_id?: number;
  page?: number;
}

export async function getFeed(filters: FeedFilters = {}): Promise<FeedResponse> {
  const params = new URLSearchParams();
  if (filters.work_type) params.set("work_type", filters.work_type);
  if (filters.city_id != null) params.set("city_id", String(filters.city_id));
  if (filters.district_id != null) params.set("district_id", String(filters.district_id));
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));

  const qs = params.toString();
  return apiFetch<FeedResponse>(`/marketplace/requests/${qs ? `?${qs}` : ""}`);
}

export async function getRequestDetail(id: number): Promise<FeedRequestDetail> {
  return apiFetch<FeedRequestDetail>(`/marketplace/requests/${id}/`);
}

export interface ContractorBrief {
  id: number;
  full_name: string;
  verification_status: string | null;
}

export interface BidPayload {
  price: string;
  deadline_days: number;
  comment?: string;
}

export interface Bid {
  id: number;
  contractor: ContractorBrief;
  comment: string;
  price: string;
  deadline_days: number;
  status: "pending" | "selected" | "rejected";
  created_at: string;
}

export async function createBid(requestId: number, payload: BidPayload): Promise<Bid> {
  return apiFetch<Bid>(`/marketplace/requests/${requestId}/bids/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
