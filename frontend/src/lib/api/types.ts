/* ────────────────────────────────────────────────────────────────────────
   Типы запросов/ответов accounts API.
   Списаны с backend/apps/accounts/serializers.py — держать в синхроне
   при изменении сериализаторов.
   ──────────────────────────────────────────────────────────────────────── */

export type Role = "customer" | "contractor";
export type PersonType = "individual" | "legal";
export type VerificationStatus = "pending" | "verified" | "rejected";

export interface LoginPayload {
  email: string;
  password: string;
}

export interface LoginResponse {
  access: string;
  refresh: string;
  user_id: number;
  role: Role;
}

export interface RefreshResponse {
  access: string;
  refresh?: string; // приходит, если ROTATE_REFRESH_TOKENS=True
}

export interface BaseRegistrationPayload {
  email: string;
  password: string;
  person_type: PersonType;
  full_name: string;
  phone: string;
  iin?: string;
  bin?: string;
}

export type CustomerRegistrationPayload = BaseRegistrationPayload;

export type ContractorRegistrationPayload = BaseRegistrationPayload;

export interface MeResponse {
  id: number;
  email: string;
  role: Role;
  person_type: PersonType;
  full_name: string;
  phone: string;
  verification_status: VerificationStatus | null;
}

/** Ошибка валидации DRF: { "field": ["сообщение", ...], ... } */
export type ApiFieldErrors = Record<string, string[]>;

export class ApiError extends Error {
  status: number;
  fieldErrors: ApiFieldErrors | null;

  constructor(status: number, message: string, fieldErrors: ApiFieldErrors | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}
