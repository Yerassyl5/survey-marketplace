/* ────────────────────────────────────────────────────────────────────────
   tokens.ts — единая точка чтения/записи JWT.
   Сейчас: localStorage (см. обоснование в docs/progress.md — техдолг
   "хранение JWT" перед продом). Если решение сменится на httpOnly cookie,
   меняется только этот файл — остальной код работает через getAccessToken/
   setTokens/clearTokens и не знает о механизме хранения.
   ──────────────────────────────────────────────────────────────────────── */

const ACCESS_KEY = "progeo_access";
const REFRESH_KEY = "progeo_refresh";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function getAccessToken(): string | null {
  if (!isBrowser()) return null;
  return window.localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  if (!isBrowser()) return null;
  return window.localStorage.getItem(REFRESH_KEY);
}

export function setTokens(access: string, refresh: string): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(ACCESS_KEY, access);
  window.localStorage.setItem(REFRESH_KEY, refresh);
}

export function setAccessToken(access: string): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(ACCESS_KEY, access);
}

export function clearTokens(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(ACCESS_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
}
