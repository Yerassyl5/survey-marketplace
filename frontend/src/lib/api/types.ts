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

/** GET/PATCH /accounts/profile/ — полный набор для /ru/settings, отдельно от
 * MeResponse (тот лёгкий, дёргается на каждой загрузке приложения). */
export interface ProfileResponse {
  id: number;
  email: string;
  role: Role;
  person_type: PersonType;
  full_name: string;
  phone: string;
  iin: string;
  bin: string;
  organization_name: string;
  position: string;
  portfolio_description: string | null;
  verification_status: VerificationStatus | null;
  rejection_reason: string | null;
  has_license_scan: boolean;
  has_attestation_scan: boolean;
}

export interface UpdateProfilePayload {
  phone?: string;
  portfolio_description?: string;
}

export interface ChangePasswordPayload {
  current_password: string;
  new_password: string;
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
