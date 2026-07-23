/* ────────────────────────────────────────────────────────────────────────
   client.ts — единая точка HTTP-запросов к backend.
   Все запросы идут на /api/* (тот же origin) — next.config.ts проксирует
   их на backend, поэтому здесь не нужен ни абсолютный URL, ни CORS.
   На 401 — одна попытка обновить access через refresh (single-flight:
   параллельные запросы ждут один и тот же промис обновления).
   ──────────────────────────────────────────────────────────────────────── */

import { translateMessage } from "./errorMessages";
import { clearTokens, getAccessToken, getRefreshToken, setAccessToken, setTokens } from "./tokens";
import { ApiError, type RefreshResponse } from "./types";

const API_BASE = "/api";

let refreshPromise: Promise<string | null> | null = null;

async function performRefresh(): Promise<string | null> {
  const refresh = getRefreshToken();
  if (!refresh) return null;

  try {
    const res = await fetch(`${API_BASE}/accounts/token/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh }),
    });
    if (!res.ok) {
      clearTokens();
      return null;
    }
    const data: RefreshResponse = await res.json();
    if (data.refresh) {
      setTokens(data.access, data.refresh);
    } else {
      setAccessToken(data.access);
    }
    return data.access;
  } catch {
    clearTokens();
    return null;
  }
}

function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = performRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

function isFieldErrors(data: unknown): data is Record<string, string[]> {
  return (
    !!data &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    !("detail" in (data as Record<string, unknown>))
  );
}

function extractErrorMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  if (typeof obj.detail === "string") return obj.detail;
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (Array.isArray(val) && typeof val[0] === "string") return val[0];
  }
  return null;
}

/** {"code": "email_not_verified", "detail": "..."} — плоская форма, не
 * обёрнутая (backend/apps/marketplace/views.py::EmailVerifiedRequired
 * поднимает PermissionDenied(detail={"code": ..., "detail": ...}) именно
 * ради этого — проверено фактом через curl при планировании этапа 3). */
function extractErrorCode(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const val = (data as Record<string, unknown>).code;
  return typeof val === "string" ? val : null;
}

export interface ApiFetchOptions extends RequestInit {
  /** Прикладывать Authorization-заголовок. По умолчанию true. */
  auth?: boolean;
}

/** Сессия не восстановлена после неудачного refresh — вызывающий код решает, редиректить ли на /login. */
export class AuthRequiredError extends Error {}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { auth = true, headers, ...rest } = options;

  const buildHeaders = (token: string | null): Headers => {
    const h = new Headers(headers);
    if (!h.has("Content-Type") && rest.body && !(rest.body instanceof FormData)) {
      h.set("Content-Type", "application/json");
    }
    if (auth && token) {
      h.set("Authorization", `Bearer ${token}`);
    }
    return h;
  };

  const doFetch = (token: string | null) =>
    fetch(`${API_BASE}${path}`, { ...rest, headers: buildHeaders(token) });

  let res: Response;
  try {
    res = await doFetch(auth ? getAccessToken() : null);
  } catch {
    throw new ApiError(0, "Нет соединения с сервером. Проверьте интернет-соединение.");
  }

  if (auth && res.status === 401) {
    const newToken = await refreshAccessToken();
    if (!newToken) {
      throw new AuthRequiredError("Сессия истекла, требуется повторный вход.");
    }
    try {
      res = await doFetch(newToken);
    } catch {
      throw new ApiError(0, "Нет соединения с сервером. Проверьте интернет-соединение.");
    }
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const isJson = res.headers.get("content-type")?.includes("application/json") ?? false;
  const data = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    const rawMessage = extractErrorMessage(data) ?? `Ошибка запроса (${res.status}).`;
    const message = translateMessage(rawMessage);

    let fieldErrors: Record<string, string[]> | null = null;
    if (isFieldErrors(data)) {
      fieldErrors = {};
      for (const [key, messages] of Object.entries(data)) {
        fieldErrors[key] = messages.map((m) => translateMessage(m, key));
      }
    }

    throw new ApiError(res.status, message, fieldErrors, extractErrorCode(data));
  }

  return data as T;
}
