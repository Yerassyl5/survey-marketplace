/* ────────────────────────────────────────────────────────────────────────
   tokens.ts — единая точка чтения/записи JWT.
   Хранилище выбирается по «Запомнить меня» на /login: remember=true →
   localStorage (переживает закрытие браузера), remember=false →
   sessionStorage (стирается при закрытии вкладки).
   Вызовы без явного remember (single-flight refresh в client.ts) продолжают
   писать в то хранилище, где уже лежит текущая сессия — client.ts не знает
   о механизме хранения и не меняется вместе с этим файлом.
   Если решение сменится на httpOnly cookie, меняется только этот файл —
   остальной код работает через getAccessToken/setTokens/clearTokens.
   ──────────────────────────────────────────────────────────────────────── */

const ACCESS_KEY = "progeo_access";
const REFRESH_KEY = "progeo_refresh";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

/** Хранилище активной сессии: sessionStorage, если там уже есть refresh-токен, иначе localStorage. */
function activeStorage(): Storage {
  if (window.sessionStorage.getItem(REFRESH_KEY) !== null) {
    return window.sessionStorage;
  }
  return window.localStorage;
}

function otherStorage(storage: Storage): Storage {
  return storage === window.localStorage ? window.sessionStorage : window.localStorage;
}

export function getAccessToken(): string | null {
  if (!isBrowser()) return null;
  return window.sessionStorage.getItem(ACCESS_KEY) ?? window.localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  if (!isBrowser()) return null;
  return window.sessionStorage.getItem(REFRESH_KEY) ?? window.localStorage.getItem(REFRESH_KEY);
}

/**
 * remember=true  → localStorage (persistent)
 * remember=false → sessionStorage (до закрытия вкладки)
 * remember не передан → пишет в то же хранилище, где уже активна сессия
 * (используется при обновлении токена по refresh, без переключения режима).
 */
export function setTokens(access: string, refresh: string, remember?: boolean): void {
  if (!isBrowser()) return;
  const storage =
    remember === undefined ? activeStorage() : remember ? window.localStorage : window.sessionStorage;
  const other = otherStorage(storage);
  storage.setItem(ACCESS_KEY, access);
  storage.setItem(REFRESH_KEY, refresh);
  other.removeItem(ACCESS_KEY);
  other.removeItem(REFRESH_KEY);
}

export function setAccessToken(access: string): void {
  if (!isBrowser()) return;
  activeStorage().setItem(ACCESS_KEY, access);
}

export function clearTokens(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(ACCESS_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
  window.sessionStorage.removeItem(ACCESS_KEY);
  window.sessionStorage.removeItem(REFRESH_KEY);
}
