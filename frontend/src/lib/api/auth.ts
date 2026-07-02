/* ────────────────────────────────────────────────────────────────────────
   auth.ts — типизированные обёртки над accounts API.
   ──────────────────────────────────────────────────────────────────────── */

import { apiFetch } from "./client";
import { clearTokens, getRefreshToken, setTokens } from "./tokens";
import type {
  ContractorRegistrationPayload,
  CustomerRegistrationPayload,
  LoginPayload,
  LoginResponse,
  MeResponse,
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
