# Сессия 2026-06-30 — Геомодуль (1.6) + Базовая админка (1.7)

## Закрытые пункты

### 1.6 — Геомодуль: загрузка и парсинг KML/GeoJSON

**Эндпоинт:** `POST /api/sites/{site_id}/geometry/`

**Новые файлы:**
- `backend/apps/geo/events.py` — событие `GeometryUploaded(site_id, file_format)`
- `backend/apps/geo/services.py` — `parse_geo_file()`:
  - GeoJSON: `json.loads()` → Feature / FeatureCollection / голая геометрия → `GEOSGeometry`
  - KML: запись во `tempfile.NamedTemporaryFile` → `DataSource` (GDAL)
  - `_force_2d()` через `WKBWriter(outdim=2)` — сброс Z-координаты (KML хранит высоту, Site.geometry — 2D)
  - Валидация: размер ≤ 10 МБ, расширение, корректность геометрии → `ValidationError` → 400
- `backend/apps/geo/views.py` — `SiteGeometryUploadView`: только заказчик-владелец; `DataError` при `save()` → 400
- `backend/apps/geo/urls.py` — маршрут

**Изменены:**
- `backend/config/urls.py` — подключён `apps.geo.urls`

**Тестовые файлы:** `backend/test_data/polygon.geojson`, `polygon.kml` (Астана, WGS84), `broken.json`

**Исправленный баг:** `DataError "Geometry has Z dimension but column does not"` — KML содержит 3D-координаты, `_force_2d()` сбрасывает Z перед записью в БД.

**Коммит:** `5644227`

---

### 1.7 — Базовая Django Admin

**Изменены три файла (только `admin.py`):**

`accounts/admin.py`:
- `UserAdmin`: добавлен `phone` в `list_display`
- `ContractorProfileAdmin`: `list_editable = ["verification_status"]` (смена статуса прямо из списка); кастомные методы `license_scan_link` / `attestation_scan_link` с `format_html` — кликабельные ссылки на сканы в колонке списка

`sites/admin.py`:
- `list_select_related = ["owner"]` (устранён N+1)
- `ordering = ["-created_at"]`

`marketplace/admin.py`:
- `RequestAdmin`: `"site"` в `list_display`, `date_hierarchy = "created_at"`, `list_select_related`
- `BidAdmin`: расширен `list_filter` (`request__work_type`), `search_fields` (`request__city`, `request__description`), `list_select_related`

**Коммит:** `eca91ac`

---

## Незакрытые хвосты backend Волны 1

| Пункт | Статус | Приоритет |
|---|---|---|
| 1.8 i18n (Django backend) | `[ ]` | Низкий — не блокирует фронтенд |
| 1.9 AuditLog (персистирование событий) | `[ ]` | Средний |
| Техдолг 1.5 (MinIO тест submit-result) | `[ ]` | Низкий |
| `ContractorDocumentsSubmitted` событие | `[ ]` | Средний (нужен для уведомлений 2.4) |

## Следующий приоритет

**Фронтенд Волны 1** (~15–18 экранов):
1. Auth: регистрация (роль → тип лица → условные поля), вход, хранение JWT
2. Критический путь: создание заявки → лента (исполнитель) → отклик → выбор → сдача результата → приёмка
3. Карта: MapLibre, отображение Site.geometry, загрузка KML/GeoJSON и превью контура
4. i18n: переключатель языка, наполнить kk/ru/en переводы
5. Темы: кнопка переключения dark/light (CSS-токены уже есть)
