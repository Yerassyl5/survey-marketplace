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

/** Собственный отклик исполнителя на ЭТУ заявку — MyBidBriefSerializer
 * на бэкенде (backend/apps/marketplace/serializers.py), встроен в ответ
 * RequestFeedDetailSerializer.to_representation(). status + considered_at
 * достаточны, чтобы построить все пять честных состояний на странице
 * заявки (MyBidStatusPanel) БЕЗ обращения к Request.status. */
export interface MyBidBrief {
  id: number;
  price: string;
  deadline_days: number;
  comment: string;
  created_at: string;
  status: "pending" | "selected" | "rejected";
  considered_at: string | null;
}

/** Файл результата — ResultFileSerializer на бэкенде. `file` — уже готовый
 * абсолютный URL (тот же механизм, что и tz_file: string). */
export interface ResultFile {
  id: number;
  file: string;
  original_name: string;
  uploaded_at: string;
}

/** Запись ленты результата — ResultEntrySerializer (backend/apps/marketplace/serializers.py).
 * author НЕ отдаётся — роль однозначно читается из kind (submitted → исполнитель,
 * returned/accepted → заказчик), фронт уже знает обе стороны из контекста страницы. */
export interface ResultEntry {
  id: number;
  kind: "submitted" | "returned" | "accepted";
  text: string;
  created_at: string;
  files: ResultFile[];
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
  /** status/result_files/result_note присутствуют в ДВУХ разных случаях,
   * с разным условием на бэкенде:
   * 1) RequestSerializer — заказчик смотрит СВОЮ заявку ("status" in response
   *    уже готовый признак «это владелец, полный вид», is_owner не нужен).
   * 2) RequestFeedDetailSerializer, ветка assigned_contractor_id === viewer.id —
   *    исполнитель-ПОБЕДИТЕЛЬ смотрит заявку, которую выиграл (инвариант №9:
   *    проигравший это же поле не получает структурно, см. backend
   *    RequestFeedDetailSerializer.to_representation).
   * bids_count/assigned_contractor — только у заказчика (случай 1). */
  status?: MyRequest["status"];
  bids_count?: number;
  assigned_contractor?: number | null;
  result_files?: ResultFile[];
  result_note?: string;
  /** Причина последнего возврата на доработку (ReturnView) — та же пара условий
   * раскрытия, что и у result_files/result_note выше. Пусто/отсутствует ⟺
   * заявка ни разу не возвращалась (см. backend Request.return_note).
   * @deprecated фронт больше не читает — источник истины теперь result_entries
   * ниже (result_note/return_note заморожены на бэкенде с 2026-07-17, поле
   * пока физически не удалено — уберётся вместе с ним отдельным подшагом). */
  return_note?: string;
  /** Лента результата (сдал/вернул/принял, каждая запись со своими файлами и
   * текстом) — та же пара условий раскрытия, что и result_files/result_note/
   * return_note выше: заказчик-владелец видит всегда, исполнитель — только
   * победитель (assigned_contractor_id === viewer.id), проигравшему не
   * приходит вообще (инвариант №9, подтверждено тестом на detail-
   * сериализаторе, не только curl). Заменяет result_files/result_note/
   * return_note как источник для UI — те три поля фронт больше не читает. */
  result_entries?: ResultEntry[];
  /** Только для роли contractor, только если он откликался — см.
   * MyBidBrief. Отсутствует у заказчика и у исполнителя без отклика. */
  my_bid?: MyBidBrief;
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

/** Отклик для ЗАКАЗЧИКА-владельца заявки — BidCustomerSerializer (backend
 * apps/marketplace/serializers.py). considered_at/contractor_phone здесь
 * есть; contractor_phone == null, пока отклик не рассмотрен (гейт на
 * бэкенде, во view/сериализаторе, не только в UI). */
export interface BidWithConsideration extends Bid {
  considered_at: string | null;
  contractor_phone: string | null;
}

/** GET .../bids/ у BidListCreateView не задаёт pagination_class и не
 * подпадает под глобальный DEFAULT_PAGINATION_CLASS (в settings.py такой
 * ключ вообще отсутствует) — отдаёт голый массив, не {results: [...]}. */
export async function getBids(requestId: number): Promise<BidWithConsideration[]> {
  return apiFetch<BidWithConsideration[]>(`/marketplace/requests/${requestId}/bids/`);
}

export async function considerBid(bidId: number): Promise<BidWithConsideration> {
  return apiFetch<BidWithConsideration>(`/marketplace/bids/${bidId}/consider/`, {
    method: "POST",
  });
}

/** WithdrawBidView отдаёт 200 без тела (Content-Length: 0, без Content-Type
 * вообще — проверено curl -i) — apiFetch не пытается парсить JSON в этом
 * случае, возвращает null; Promise<void> просто игнорирует значение. */
export async function withdrawBid(bidId: number): Promise<void> {
  await apiFetch<void>(`/marketplace/bids/${bidId}/withdraw/`, {
    method: "POST",
  });
}

/** Заявка, на которую сделан отклик — контекст для «Моих откликов»
 * (BidRequestBriefSerializer на бэкенде). Инвариант №9: НЕ включает
 * status/bids_count — исполнитель видит статус СВОЕГО отклика (см. MyBid),
 * не заявки. */
export interface BidRequestBrief {
  id: number;
  work_type: WorkType;
  location_display: string;
  description: string;
}

/** GET /marketplace/my-bids/ — «Мои отклики» (BidOwnerSerializer). contractor
 * унаследован от Bid (это сам исполнитель, смотрящий на себя) — поле
 * присутствует в ответе, но в вёрстке «Моих откликов» не используется. */
export interface MyBid extends Bid {
  considered_at: string | null;
  request: BidRequestBrief;
}

export async function getMyBids(): Promise<MyBid[]> {
  return apiFetch<MyBid[]>("/marketplace/my-bids/");
}

export async function awardBid(requestId: number, bidId: number): Promise<{ status: string }> {
  return apiFetch<{ status: string }>(`/marketplace/requests/${requestId}/award/`, {
    method: "POST",
    body: JSON.stringify({ bid_id: bidId }),
  });
}

/** POST .../submit-result/ — только status=AWARDED на бэкенде (см.
 * backend/apps/marketplace/views.py::SubmitResultView): ПОКА заявка в
 * result_submitted, повторный вызов вернёт 404 — «досдать файлы» возможно
 * только после возврата на доработку (ReturnView переводит обратно в
 * awarded), не в любой момент. Ключ result_files повторяется на каждый
 * файл (request.FILES.getlist("result_files") на бэкенде), как и paths
 * в createRequest — тот же паттерн multipart через FormData. */
export async function submitResult(requestId: number, files: File[], note: string): Promise<{ status: string }> {
  const formData = new FormData();
  files.forEach((f) => formData.append("result_files", f));
  if (note.trim()) formData.append("result_note", note.trim());
  return apiFetch<{ status: string }>(`/marketplace/requests/${requestId}/submit-result/`, {
    method: "POST",
    body: formData,
  });
}

/** POST .../accept/ — только status=RESULT_SUBMITTED на бэкенде (AcceptView), терминальный
 * переход в accepted. Статус «принято» ставит только заказчик (инвариант №2). */
export async function acceptResult(requestId: number): Promise<{ status: string }> {
  return apiFetch<{ status: string }>(`/marketplace/requests/${requestId}/accept/`, {
    method: "POST",
  });
}

/** POST .../return/ — только status=RESULT_SUBMITTED на бэкенде (ReturnView), возвращает в
 * awarded. return_note ОБЯЗАТЕЛЬНА на бэкенде (400 без неё) — фронт валидирует то же самое
 * заранее в ReturnResultDialog, но сервер — источник истины. */
export async function returnResult(requestId: number, returnNote: string): Promise<{ status: string }> {
  return apiFetch<{ status: string }>(`/marketplace/requests/${requestId}/return/`, {
    method: "POST",
    body: JSON.stringify({ return_note: returnNote }),
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
  status: "open" | "under_review" | "awarded" | "result_submitted" | "accepted";
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
