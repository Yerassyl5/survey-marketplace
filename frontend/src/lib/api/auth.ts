/* ────────────────────────────────────────────────────────────────────────
   auth.ts — типизированные обёртки над accounts API.
   ──────────────────────────────────────────────────────────────────────── */

import { apiFetch } from "./client";
import { clearTokens, getRefreshToken, setTokens } from "./tokens";
import type {
  ChangePasswordPayload,
  ContractorPublicResponse,
  ContractorRegistrationPayload,
  CustomerRegistrationPayload,
  LoginPayload,
  LoginResponse,
  MeResponse,
  ProfileResponse,
  UpdateProfilePayload,
} from "./types";

export async function login(payload: LoginPayload, remember: boolean = true): Promise<LoginResponse> {
  const data = await apiFetch<LoginResponse>("/accounts/login/", {
    method: "POST",
    body: JSON.stringify(payload),
    auth: false,
  });
  setTokens(data.access, data.refresh, remember);
  return data;
}

export async function registerCustomer(
  payload: CustomerRegistrationPayload,
): Promise<{ id: number }> {
  return apiFetch("/accounts/register/customer/", {
    method: "POST",
    body: JSON.stringify(payload),
    auth: false,
  });
}

export async function registerContractor(
  payload: ContractorRegistrationPayload,
): Promise<{ id: number }> {
  return apiFetch("/accounts/register/contractor/", {
    method: "POST",
    body: JSON.stringify(payload),
    auth: false,
  });
}

export async function me(): Promise<MeResponse> {
  return apiFetch<MeResponse>("/accounts/me/");
}

export async function logout(): Promise<void> {
  const refresh = getRefreshToken();
  try {
    if (refresh) {
      await apiFetch("/accounts/logout/", {
        method: "POST",
        body: JSON.stringify({ refresh }),
      });
    }
  } finally {
    // Токены чистим всегда, даже если blacklist-запрос не удался
    // (например, refresh уже истёк) — пользователь в любом случае выходит локально.
    clearTokens();
  }
}

export async function getProfile(): Promise<ProfileResponse> {
  return apiFetch<ProfileResponse>("/accounts/profile/");
}

export async function updateProfile(payload: UpdateProfilePayload): Promise<ProfileResponse> {
  return apiFetch<ProfileResponse>("/accounts/profile/", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

/** НЕ вызывать authApi.logout() после успеха — refresh уже в блеклисте
 * (backend блеклистит ВСЕ токены пользователя), запрос на /accounts/logout/
 * с уже блеклистнутым refresh упадёт ошибкой. Вызывающая сторона должна
 * почистить токены напрямую через clearTokens() и увести на /login сама. */
export async function changePassword(payload: ChangePasswordPayload): Promise<void> {
  await apiFetch<void>("/accounts/change-password/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function uploadContractorDocuments(files: {
  licenseScan?: File;
  attestationScan?: File;
}): Promise<void> {
  const formData = new FormData();
  if (files.licenseScan) formData.append("license_scan", files.licenseScan);
  if (files.attestationScan) formData.append("attestation_scan", files.attestationScan);
  await apiFetch<void>("/accounts/contractor/documents/", {
    method: "PATCH",
    body: formData,
  });
}

/** GET /accounts/contractors/{id}/ — публичная карточка исполнителя, для
 * ЧУЖОГО профиля (этап 5). На своей карточке используется getProfile() —
 * см. докстринг ContractorCardPage: один и тот же ProfileResponse кормит и
 * отображение, и форму редактирования "О себе", без второго типа. 404 —
 * одинаково для несуществующего id и для id заказчика (backend, этап 3). */
export async function getContractorPublic(id: number): Promise<ContractorPublicResponse> {
  return apiFetch<ContractorPublicResponse>(`/accounts/contractors/${id}/`);
}

/** POST /accounts/verify-email/ — AllowAny на backend (токен сам доказывает
 * личность), auth:false здесь тоже: страница /verify-email доступна и
 * незалогиненному в этом браузере (этап 4 блока 1.11). */
export async function verifyEmail(token: string): Promise<{ detail: string; is_email_verified: boolean }> {
  return apiFetch("/accounts/verify-email/", {
    method: "POST",
    body: JSON.stringify({ token }),
    auth: false,
  });
}

/** POST /accounts/resend-verification/ — IsAuthenticated, троттлинг 5/hour
 * на backend (см. ResendVerificationView). */
export async function resendVerification(): Promise<{ detail: string }> {
  return apiFetch("/accounts/resend-verification/", { method: "POST" });
}
