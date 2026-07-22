/* ────────────────────────────────────────────────────────────────────────
   auth.ts — типизированные обёртки над accounts API.
   ──────────────────────────────────────────────────────────────────────── */

import { apiFetch } from "./client";
import { clearTokens, getRefreshToken, setTokens } from "./tokens";
import type {
  ChangePasswordPayload,
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
