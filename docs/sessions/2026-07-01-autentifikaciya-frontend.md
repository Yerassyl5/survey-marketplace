# Сессия 2026-07-01 — Аутентификация фронтенда

## Решение сессии
Построен и полностью проверен в браузере блок аутентификации фронтенда: структура проекта,
единый API-клиент (JWT + auto-refresh), хранение токенов, `/ru/login`, `/ru/register`, защита
приватных маршрутов. По пути найдены и починены два реальных инфраструктурных бага, не
связанных напрямую с фронтенд-кодом, но блокировавших весь блок.

## Обсуждённые решения (до кода)

1. **Хранение JWT — localStorage, не httpOnly cookie.** Backend уже реализован под
   `Authorization: Bearer` (SimpleJWT/DRF по умолчанию читает токен только из заголовка).
   httpOnly cookie потребовал бы правок backend (кастомный auth-класс, `Set-Cookie` в
   `LoginView`, CSRF-исключение, очистка cookie в `LogoutView`) — вне скоупа
   «только фронтенд» в этой сессии. Явно зафиксирован техдолг: пересмотреть перед продом
   (CSP либо переход на httpOnly + BFF), особенно если появится рендер сырого HTML от
   пользователей.
2. **Следствие:** т.к. токены в localStorage не видны `proxy.ts` (server-side), защита
   приватных маршрутов — клиентский guard в `(app)/layout.tsx` (спиннер → редирект), а не
   middleware/proxy.
3. **Прокси `/api/*` через `next.config.ts` rewrites** на `backend:8000` — браузер всегда
   стучится на свой origin, CORS не нужен ни в dev, ни в проде (та же логика, что и у
   Coolify в проде: `/api` роутится в обход Next.js).
4. **Регистрация одним экраном** (не wizard): роль → тип лица → условные поля ИИН/БИН.
   Документы верификации (лицензия/аттестат) сознательно НЕ в форме регистрации — отдельный
   шаг на будущем `/ru/profile`, ради конверсии.

## Что построено

- **Структура:** route groups `[locale]/(auth)/{login,register}` и `[locale]/(app)/layout.tsx`
  (+ временная заглушка `(app)/dashboard` только для проверки guard'а).
- **`lib/api/`:** `tokens.ts` (localStorage за единым интерфейсом), `client.ts` (`apiFetch` —
  Bearer-заголовок, single-flight refresh на 401), `auth.ts`/`types.ts` (типизированные
  `login`/`registerCustomer`/`registerContractor`/`me`/`logout` под реальные сериализаторы),
  `errorMessages.ts` (см. ниже).
- **`contexts/AuthContext.tsx`** — `user`/`isLoading`/`login`/`logout`/`refreshUser`, подключён
  в root `[locale]/layout.tsx`.
- **UI-примитивы:** `components/ui/{Input,FormField,Alert}.tsx` (aria-live на ошибках),
  `components/auth/{RoleSelectCard,PersonTypeToggle}.tsx` — всё в институциональном стиле
  (инлайн-стили на `--ds-*` токенах, по паттерну существующих `Badge.tsx`/`AppNav.tsx`).
- Мелкий фикс несостыковки: `AppNavUser.role` был `"client"`, поправлен на `"customer"`
  (реальное значение backend `Role.CUSTOMER`).

## Найденные и починенные инфра-баги

1. **Next.js 16 vs Django `APPEND_SLASH`.** Next сам 308-редиректит URL с завершающим слэшем
   на URL без него ещё до применения rewrite; Django для не-GET запросов вместо редиректа
   кидает `RuntimeError`. Фикс: `skipTrailingSlashRedirect: true` + явный литеральный `/` в
   конце destination rewrite'а (catch-all `:path*` иначе теряет слэш при реконструкции).
2. **`DisallowedHost`.** Next-прокси шлёт `Host: backend:8000` бэкенду — добавлено `backend`
   в `DJANGO_ALLOWED_HOSTS`.
3. **CSRF 403 на регистрации/логине из браузера (самый содержательный баг).** Если в том же
   браузере залогинены в Django Admin, Django-сессия ставится без `Domain` → cookie скоуплен
   на хост `localhost` **независимо от порта** → браузер несёт `sessionid` и на запросы к
   фронтенд-прокси. `SessionAuthentication` (был в `DEFAULT_AUTHENTICATION_CLASSES`) видел
   валидную сессию и включал `enforce_csrf()`, а JWT-фронтенд не шлёт ни доверенный `Origin`,
   ни CSRF-токен. Поэтому curl (без cookie-jar) никогда не воспроизводил баг, а браузер —
   всегда. Воспроизведено намеренно (реальная Django-сессия через cookie-jar) до и после
   фикса. `CSRF_TRUSTED_ORIGINS` одного оказалось недостаточно (закрывает только Origin-
   проверку, следом падает отдельная проверка CSRF-токена) — полный фикс: убрать
   `SessionAuthentication` из `DEFAULT_AUTHENTICATION_CLASSES` (API только JWT, Django Admin
   работает отдельно и в этой настройке не участвует). `CSRF_TRUSTED_ORIGINS` оставлен как
   defense-in-depth. После фикса вручную проверено, что Django Admin по-прежнему открывается
   и логинит нормально.

## Русификация сообщений об ошибках

Свои валидаторы (`accounts/serializers.py`) уже пишут ошибки по-русски в коде — не трогали.
Точечный фронт-маппинг (`lib/api/errorMessages.ts`, подключён централизованно в
`client.ts`) для сообщений фреймворка: неверный логин/пароль (SimpleJWT), обязательное поле,
поле не может быть пустым, некорректный email, `CSRF Failed`, дубликат уникального поля
(включая обнаруженную частично русифицированную Django-форму `"user с таким email уже
существует."` — ловится по русскому окончанию, не только по английскому), min/max длина поля.
Полная локализация DRF через Django i18n — отдельная задача 1.8, не поднималась.

## Проверено

- curl через прокси: register (customer/contractor) → 201, login → 200, `/me/` → 200/401,
  refresh → новая пара с ротацией.
- Живьём в браузере (в т.ч. инкогнито): регистрация заказчика и исполнителя (физлицо/юрлицо,
  условный ИИН/БИН), предупреждение о верификации исполнителю, вход (верный/неверный пароль),
  guard `/ru/dashboard` → редирект на `/ru/login`, редирект на `/ru` после входа, русские
  сообщения об ошибках, институциональный стиль. Django Admin — без регрессии.
- `tsc --noEmit` и `eslint` по всем новым файлам — чисто.

## Уборка

Тестовые аккаунты, оставшиеся от отладки (`auth-test3@`, `csrf-fix-check@`,
`csrf-fix-contractor@progeo.kz`, временный суперюзер `temp-csrf-repro@progeo.kz`) — удалены
из dev-БД. Прочие аккаунты в БД (старые фикстуры смок-тестов на `@example.com` и несколько
аккаунтов, похожих на собственную инкогнито-проверку пользователя) — оставлены как есть по
явному решению пользователя.

## Зафиксированный техдолг (в `docs/progress.md`)

1. Хранение JWT — пересмотреть перед продом (CSP либо httpOnly + BFF).
2. `AppNavUser.role` исправлен `client` → `customer`.
3. Новая env `INTERNAL_API_URL` (rewrite-прокси) и `DJANGO_CSRF_TRUSTED_ORIGINS`.

## Открытый вопрос (перенесён)

Маршрут лендинга: `/ru/landing` vs корень locale (`/ru`) — не обсуждался в этой сессии.

## Текущая точка

Блок аутентификации фронтенда закрыт и проверен вживую. Следующий шаг — лента заявок →
реальные данные из API (`/ru/feed`).

## Коммиты сессии

Изменения не закоммичены — сессия завершена без явного запроса на коммит. Незакоммиченные
файлы: `backend/config/settings.py`, `docker-compose.yml`, `.env.example`,
`frontend/next.config.ts`, `frontend/src/app/[locale]/layout.tsx`, `frontend/src/app/globals.css`,
`frontend/src/components/ui/AppNav.tsx`, плюс новые файлы в
`frontend/src/app/[locale]/(auth)/`, `(app)/`, `components/auth/`, `components/ui/{Alert,FormField,Input}.tsx`,
`contexts/`, `lib/api/`. Реальный `.env` изменён локально (не в git, см. `.gitignore`).
