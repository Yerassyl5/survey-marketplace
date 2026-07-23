"""
Django settings. Каркас — без бизнес-логики.
Конфигурация читается из окружения (.env), см. .env.example в корне репозитория.
"""
import os
from datetime import timedelta
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "dev-insecure-secret-key")
DEBUG = os.environ.get("DJANGO_DEBUG", "1") == "1"
ALLOWED_HOSTS = os.environ.get("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")

# Фронтенд стучится на /api/* через свой origin (next.config.ts проксирует на backend),
# поэтому этот origin нужно явно доверять для проверки Origin в CsrfViewMiddleware —
# иначе любой запрос, аутентифицированный через Django-сессию (не JWT), получит 403
# "CSRF Failed: Origin checking failed".
CSRF_TRUSTED_ORIGINS = os.environ.get(
    "DJANGO_CSRF_TRUSTED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
).split(",")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.gis",
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "drf_spectacular",
    "apps.accounts",
    "apps.sites",
    "apps.marketplace",
    "apps.contracts",
    "apps.reputation",
    "apps.geo",
    "apps.notifications",
    "apps.billing",
    "apps.analytics",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.locale.LocaleMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.contrib.gis.db.backends.postgis",
        "NAME": os.environ.get("POSTGRES_DB", "progeo"),
        "USER": os.environ.get("POSTGRES_USER", "progeo"),
        "PASSWORD": os.environ.get("POSTGRES_PASSWORD", "progeo"),
        "HOST": os.environ.get("POSTGRES_HOST", "db"),
        "PORT": os.environ.get("POSTGRES_PORT", "5432"),
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# Трёхъязычие с первого дня (architecture.md §3)
LANGUAGE_CODE = "ru"
LANGUAGES = [
    ("kk", "Қазақша"),
    ("ru", "Русский"),
    ("en", "English"),
]
LOCALE_PATHS = [BASE_DIR / "locale"]

TIME_ZONE = "Asia/Almaty"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

AUTH_USER_MODEL = "accounts.User"

REST_FRAMEWORK = {
    # Только JWT: фронтенд — stateless (Bearer-токен из localStorage, см.
    # docs/progress.md), сессионная аутентификация тут не нужна и не должна
    # использоваться. SessionAuthentication раньше был в списке по умолчанию
    # и создавал скрытый баг: если в том же браузере (на localhost, любой
    # порт — Django-сессия не привязана к порту) залогинены в Django Admin,
    # DRF начинал требовать CSRF-токен для НАШЕГО JWT-API, которого фронтенд
    # никогда не отправляет. Django Admin — отдельное приложение, использует
    # свою сессию/CSRF напрямую и в этой настройке не нуждается.
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
}

SPECTACULAR_SETTINGS = {
    "TITLE": "ПроГео API",
    "DESCRIPTION": "Маркетплейс инженерных изысканий — API для заказчиков и исполнителей.",
    "VERSION": "0.1.0",
    "SERVE_INCLUDE_SCHEMA": False,
}

# Redis / Celery
REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379/0")
CELERY_BROKER_URL = REDIS_URL
CELERY_RESULT_BACKEND = REDIS_URL

# Почта. Один и тот же EMAIL_BACKEND в dev и в проде (architecture.md §2) —
# разница только в EMAIL_HOST/кредах из .env. Dev: EMAIL_HOST=mailpit
# (сервис в docker-compose.yml), письма никуда не уходят наружу.
EMAIL_BACKEND = os.environ.get("EMAIL_BACKEND", "django.core.mail.backends.smtp.EmailBackend")
EMAIL_HOST = os.environ.get("EMAIL_HOST", "mailpit")
EMAIL_PORT = int(os.environ.get("EMAIL_PORT", "1025"))
EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = os.environ.get("EMAIL_USE_TLS", "0") == "1"
# Без явного таймаута socket.create_connection() блокируется бесконечно при
# недоступном хосте (проверено фактом при разведке retry-исключений для
# send_email_task) — тогда ретраи Celery бессмысленны: первая попытка висит
# вечно, а не падает с исключением, которое можно перехватить.
EMAIL_TIMEOUT = int(os.environ.get("EMAIL_TIMEOUT", "10"))
# Дефолт безопасен для локалки (noreply@localhost) — реальный домен только
# в .env.example/.env, чтобы пустая переменная в проде не увела письма
# от адреса, который никто не настраивал, молча (решение пользователя).
DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "noreply@localhost")

# Адрес фронтенда для ссылок в письмах (подтверждение почты, сброс пароля —
# появятся в бизнес-логике 1.11). Dev: localhost:3000, прод: реальный домен.
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")

# MinIO (S3-совместимое хранилище). В БД — только ссылки на файлы (CLAUDE.md §«Инфраструктура»).
STORAGES = {
    "default": {
        "BACKEND": "common.storage.PublicURLS3Storage",
    },
    "staticfiles": {
        "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage",
    },
}
AWS_ACCESS_KEY_ID = os.environ.get("MINIO_ROOT_USER", "minioadmin")
AWS_SECRET_ACCESS_KEY = os.environ.get("MINIO_ROOT_PASSWORD", "minioadmin")
AWS_STORAGE_BUCKET_NAME = os.environ.get("MINIO_BUCKET", "progeo")
AWS_S3_ENDPOINT_URL = os.environ.get("MINIO_ENDPOINT", "http://minio:9000")
# Публичный адрес для подписи ссылок, которые открывает браузер пользователя
# (внутри docker-сети контейнеры обращаются друг к другу по MINIO_ENDPOINT).
AWS_S3_PUBLIC_ENDPOINT_URL = os.environ.get("MINIO_PUBLIC_ENDPOINT", "http://localhost:9000")
AWS_S3_ADDRESSING_STYLE = "path"
