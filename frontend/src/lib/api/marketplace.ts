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
   * описан геометрией Site (см. FeedRequestDetail.site_geometry). Optional,
   * не только nullable: один и тот же эндпоинт (`GET /marketplace/requests/{id}/`)
   * обслуживают разные Django-сериализаторы по роли/владению заявкой — какой
   * из них реально включает это поле, тип на фронте гарантировать не может
   * (баг 2026-07-07: site_geometry отсутствовало у RequestSerializer, заказчик
   * не видел карту на своей заявке — тип это молча пропустил). */
  geometry?: GeoJSON.Geometry | null;
  location_type: LocationType;
  city: number | null;
  district: number | null;
  location_display: string;
  /** Короткая пометка заказчика для исполнителей (макс. 300 симв.), необязательна —
   * «срочно, начать в течение 3 дней», «оплата только наличными» и т.п. Пустая строка,
   * если заказчик её не заполнил. */
  contractor_note: string;
  /** null — заказчик листает общую ленту (?scope=feed) и смотрит ЧУЖУЮ заявку:
   * бэкенд обезличивает customer (RequestFeedForCustomerSerializer). Свою
   * заявку в той же ленте заказчик видит с customer заполненным. */
  customer: CustomerBrief | null;
  /** Уже откликался ли текущий исполнитель на эту заявку (аннотация Exists() на
   * бэкенде) — только для роли contractor; для заказчика (?scope=feed) поле
   * отсутствует в ответе вовсе (RequestFeedForCustomerSerializer его не отдаёт). */
  has_bid?: boolean;
  created_at: string;
  updated_at: string;
}

/** Детали заявки — GET /marketplace/requests/{id}/, только GET одной заявки,
 * не список. Один эндпоинт, но РАЗНЫЕ Django-сериализаторы по роли/владению
 * заявкой (RequestSerializer — заказчик, своя; RequestFeedDetailSerializer —
 * исполнитель; RequestFeedForCustomerDetailSerializer — заказчик, чужая через
 * ленту): набор полей у них не идентичен, поэтому этот TS-тип — объединение
 * возможных форм, не гарантия конкретного набора. site_geometry — голая
 * GeoJSON-геометрия, не Feature: в отличие от sites.SiteSerializer
 * (GeoFeatureModelSerializer), тут нет обёртки
 * {type:"Feature", geometry:{...}, properties:{...}}. Optional — не все три
 * серализатора обязаны его включать (см. комментарий у FeedRequest.geometry). */
export interface FeedRequestDetail extends FeedRequest {
  site_geometry?: GeoJSON.Geometry | null;
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
  /** Заказчик передаёт "feed", чтобы получить общую открытую ленту вместо
   * своих заявок (см. backend RequestListCreateView.get_queryset). */
  scope?: "feed";
}

export async function getFeed(filters: FeedFilters = {}): Promise<FeedResponse> {
  const params = new URLSearchParams();
  if (filters.work_type) params.set("work_type", filters.work_type);
  if (filters.city_id != null) params.set("city_id", String(filters.city_id));
  if (filters.district_id != null) params.set("district_id", String(filters.district_id));
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));
  if (filters.scope) params.set("scope", filters.scope);

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

/** Заявка заказчика (форма создания) — multipart из-за tz_file. */
export interface CreateRequestPayload {
  site: number;
  work_type: WorkType;
  description: string;
  location_type: LocationType;
  city_id?: number | null;
  district_id?: number | null;
  contractor_note?: string;
  tz_file?: File | null;
}

/** Заявка в «Мои заявки» (заказчик, свои) — RequestSerializer: статус/bids_count,
 * без customer (это он сам). */
export interface MyRequest {
  id: number;
  site: number;
  work_type: WorkType;
  description: string;
  tz_file: string | null;
  location_type: LocationType;
  city: number | null;
  district: number | null;
  location_display: string;
  contractor_note: string;
  status: "open" | "awarded" | "result_submitted" | "accepted";
  assigned_contractor: number | null;
  bids_count: number;
  created_at: string;
  updated_at: string;
}

export interface MyRequestsResponse extends PaginatedResponse<MyRequest> {
  today_count: number;
}

export async function getMyRequests(page = 1): Promise<MyRequestsResponse> {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return apiFetch<MyRequestsResponse>(`/marketplace/requests/${qs ? `?${qs}` : ""}`);
}

export async function createRequest(payload: CreateRequestPayload): Promise<{ id: number }> {
  const formData = new FormData();
  formData.append("site", String(payload.site));
  formData.append("work_type", payload.work_type);
  formData.append("description", payload.description);
  formData.append("location_type", payload.location_type);
  if (payload.city_id != null) formData.append("city", String(payload.city_id));
  if (payload.district_id != null) formData.append("district", String(payload.district_id));
  if (payload.contractor_note) formData.append("contractor_note", payload.contractor_note);
  if (payload.tz_file) formData.append("tz_file", payload.tz_file);
  return apiFetch<{ id: number }>("/marketplace/requests/", {
    method: "POST",
    body: formData,
  });
}
