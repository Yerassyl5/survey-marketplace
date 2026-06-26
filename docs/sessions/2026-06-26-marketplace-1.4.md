# Сессия 2026-06-26 — Модуль marketplace (1.4) + документация

## Что сделано

### Документация
- `docs/progress.md` — добавлен раздел «Логирование и аудит» (3 пункта: системное логирование, AuditLog, агрегация/мониторинг)
- `docs/architecture.md` — в §5 добавлен абзац про `AuditLog` (персистирование доменных событий, отдельный подписчик)
- Инвариант №5 переформулирован: мягкий вариант на MVP, toggle `REQUIRE_VERIFIED_TO_BID` для будущей жёсткой блокировки
- В 1.1 добавлен фронтенд-пункт про предупреждение при регистрации исполнителя без документов
- В 1.4 добавлен пункт «этап зрелости: включить жёсткую блокировку»

### Реализация 1.4 (заявка и отклик)

**Файлы:**
- `backend/apps/marketplace/models.py` — модели `Request`, `Bid`, enums `WorkType`, `RequestStatus`, `BidStatus`
- `backend/apps/marketplace/serializers.py` — `RequestSerializer`, `BidSerializer`, `ContractorBriefSerializer`
- `backend/apps/marketplace/views.py` — 8 views + permission-классы
- `backend/apps/marketplace/urls.py` — роутинг
- `backend/apps/marketplace/admin.py` — Django Admin
- `backend/apps/marketplace/events.py` — добавлен `contractor_id` в `BidPlaced`
- `backend/apps/marketplace/tests.py` — смок-тест 19/19
- `backend/config/urls.py` — подключён `api/marketplace/`
- `backend/apps/marketplace/migrations/0001_initial.py` — миграция

**Эндпоинты:**
| Метод | URL | Кто |
|---|---|---|
| GET/POST | `/api/marketplace/requests/` | customer (POST), authenticated (GET) |
| GET | `/api/marketplace/requests/<id>/` | customer/contractor |
| GET/POST | `/api/marketplace/requests/<id>/bids/` | customer (GET), contractor (POST) |
| POST | `/api/marketplace/requests/<id>/award/` | customer |
| POST | `/api/marketplace/requests/<id>/submit-result/` | contractor (assigned) |
| POST | `/api/marketplace/requests/<id>/accept/` | customer |
| POST | `/api/marketplace/requests/<id>/return/` | customer |
| GET | `/api/marketplace/my-bids/` | contractor |

**Ключевые решения сессии:**
- Верификация: **мягкая** (неверифицированные откликаются, статус виден заказчику). Toggle `REQUIRE_VERIFIED_TO_BID=False` в settings — одна строка в env включит жёсткую блокировку позже
- `BidSerializer` всегда отдаёт `contractor.verification_status` — заказчик сам решает
- Дублирующийся отклик перехватывается до БД: проверка через `.exists()` → `ValidationError(400)`

**Доменные события:** RequestCreated, BidPlaced (+ contractor_id), RequestAwarded, ResultSubmitted, RequestAccepted, DealCompleted

**Тесты:** 19/19 — полный цикл от создания заявки до accept и return

## Коммиты сессии
- `854f064` — Документация: логирование, аудит и AuditLog в архитектуре
- `f5b0af0` — Модуль marketplace: заявки и отклики (1.4)

## Следующий шаг
1.5 (двусторонние вехи завершения) уже закрыт в рамках 1.4.
Следующий незакрытый пункт — **1.6 геомодуль** (KML/GeoJSON, MapLibre) или фронтенд-задачи из 1.1/1.3.
