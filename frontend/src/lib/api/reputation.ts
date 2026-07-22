/* ────────────────────────────────────────────────────────────────────────
   reputation.ts — отзыв заказчика исполнителю (1.10). Отдельный REST-путь
   от marketplace (см. backend/apps/reputation/ — этап 1 плана сознательно
   не завёл поле review в ответе marketplace, чтобы не тянуть новую
   зависимость модуля marketplace → reputation, см. docs/progress.md).
   ──────────────────────────────────────────────────────────────────────── */

import { apiFetch } from "./client";

export interface ReviewTag {
  id: number;
  name: string;
}

export interface ReviewContractorBrief {
  id: number;
  full_name: string;
}

export interface Review {
  id: number;
  request: number;
  contractor: ReviewContractorBrief;
  rating: number;
  comment: string;
  tags: ReviewTag[];
  created_at: string;
}

export interface CreateReviewPayload {
  rating: number;
  comment?: string;
  tags?: number[];
}

/** GET — публично любому залогиненному (backend: IsAuthenticated, без
 * проверки владения). 404, если отзыва на эту заявку ещё нет. */
export async function getReview(requestId: number): Promise<Review> {
  return apiFetch<Review>(`/reputation/requests/${requestId}/review/`);
}

/** POST — только заказчик-владелец, только на accepted-заявке (гейт на
 * бэкенде). Ответ — уже созданный Review целиком, повторный GET не нужен. */
export async function createReview(requestId: number, payload: CreateReviewPayload): Promise<Review> {
  return apiFetch<Review>(`/reputation/requests/${requestId}/review/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** Справочник тегов — без пагинации, тот же принцип, что getLocations()
 * в lib/api/geo.ts (маленький почти статичный список). */
export async function getReviewTags(): Promise<ReviewTag[]> {
  return apiFetch<ReviewTag[]>("/reputation/tags/");
}

/** Агрегат рейтинга — та же форма {avg, count}, что ContractorRating в
 * lib/api/marketplace.ts (BidsPanel), но НЕ импортируется оттуда: страница
 * карточки исполнителя не должна тянуть модуль marketplace ради одного
 * тождественного по форме типа (см. разведку этапа 5). */
export interface ContractorRatingSummary {
  avg: number;
  count: number;
}

export interface ContractorReviewsResponse {
  rating: ContractorRatingSummary | null;
  reviews: Review[];
}

/** GET /reputation/contractors/{id}/reviews/ — публично любому залогиненному
 * (этап 3). 404 — тот же контракт, что у accounts.getContractorPublic: не
 * различает несуществующий id от id заказчика. */
export async function getContractorReviews(contractorId: number): Promise<ContractorReviewsResponse> {
  return apiFetch<ContractorReviewsResponse>(`/reputation/contractors/${contractorId}/reviews/`);
}
