# 2026-06-22 — Каркас проекта

## Что сделано
- Прочитаны CLAUDE.md, PRODUCT_SPEC.md, docs/architecture.md.
- Создана структура документации: `docs/progress.md` (чекбоксы по волнам), `docs/sessions/`.
- Инициализирован Git, `.gitignore`, первый коммит документации.
- Собран каркас проекта (без бизнес-логики):
  - `backend/` — Django-проект, 9 app-модулей (accounts, sites, marketplace, contracts, reputation, geo, notifications, billing, analytics), единый интерфейс доменных событий `common/events.py` + `events.py` в каждом app с событиями из architecture.md §5.
  - `frontend/` — Next.js (App Router, TypeScript), next-intl с локалями kk/ru/en (`/[locale]` маршрутизация), CSS-токены тёмной/светлой темы, framer-motion.
  - `docker/postgres/Dockerfile` — кастомный образ на базе postgis/postgis с pgvector.
  - `docker-compose.yml` — db, redis, minio, backend, celery-worker, celery-beat, frontend.
  - `.env.example`.

## Проблемы и решения
- **pgvector не собирался**: Postgres-образ ожидал LLVM bitcode-тулчейн (`clang-13`, `llvm-lto`), которого нет в базовом образе. Решение — собирать с `with_llvm=no` (отключает JIT-ускорение расширения, не критично для MVP).
- **Диск D: — съёмная флешка**: WSL2-backend Docker Desktop не монтирует её автоматически, из-за чего `docker-compose` bind-mount’ы (`./backend:/app`, `./frontend:/app`) видели пустую директорию и перетирали скопированные в образ файлы. Проверено напрямую через `docker run -v`. **Решение: весь проект перенесён на `C:\Project`** (включая `.git`, `.env`, историю). Старая копия на D: оставлена нетронутой.
- next-intl: `middleware.ts` должен лежать в `src/`, а не в корне frontend/, при использовании `--src-dir`.

## Результат проверки
`docker compose up` из `C:\Project` поднимает все 7 сервисов. `GET /admin/` (backend) → 200. `GET /` (frontend) → 307 → `/ru` → 200.

## Следующий шаг
Двигаться по пунктам Волны 1 (PRODUCT_SPEC.md) по одному, начиная с 1.1 (регистрация и роли).
