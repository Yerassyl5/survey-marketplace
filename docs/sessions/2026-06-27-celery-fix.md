# Сессия 2026-06-27 — Фикс celery-worker и celery-beat

## Что сделано

### Пуш в GitHub
- Запушена ветка `master` (коммиты от прошлой сессии: marketplace 1.4 + документация).

### Диагностика и фикс падения Celery
**Симптом:** `celery-worker` и `celery-beat` находились в статусе `Restarting` (циклический рестарт).

**Причина:** `ModuleNotFoundError: No module named 'rest_framework_simplejwt'`.
Celery при старте вызывает `django.setup()`, Django читает `INSTALLED_APPS`, где есть `rest_framework_simplejwt.token_blacklist` — и падал, потому что Docker-образ не был пересобран после добавления пакета `djangorestframework-simplejwt` в `requirements.txt` (пакет добавлен в сессии от 2026-06-25).

**Решение:** пересборка образов без кэша:
```
docker compose build --no-cache
docker compose up -d
```

**Результат:** все контейнеры в статусе `running`, включая `celery-worker` и `celery-beat`.

## Статус проекта
Без изменений относительно прошлой сессии — Волна 1 пункты 1.1–1.4 закрыты, следующий шаг 1.6 (геомодуль) или фронтенд.

## Урок
После добавления нового пакета в `requirements.txt` нужно пересобирать Docker-образ (`docker compose build`), иначе Celery/backend запускаются на старом слое без нового пакета.
