# Доменные события модуля accounts (см. common/events.py).
from __future__ import annotations

from dataclasses import dataclass

from common.events import DomainEvent


@dataclass(frozen=True)
class UserRegistered(DomainEvent):
    user_id: int
    role: str


@dataclass(frozen=True)
class ContractorVerificationDecided(DomainEvent):
    """Модератор принял решение по верификации исполнителя (architecture.md
    §4.1, PRODUCT_SPEC 1.2). Публикуется ТОЛЬКО при реальном переходе
    verification_status на VERIFIED/REJECTED — не на каждое сохранение
    формы в Django Admin (см. ContractorProfileAdmin.save_model).

    rejection_reason — прямо в payload, не отдельным полем на
    ContractorProfile, которое обработчику письма пришлось бы читать
    заново: значение на момент решения уже захвачено здесь, и это же
    значение попадает в журнал AuditLog без дополнительного запроса.

    changed_by_user_id — id модератора, request.user в save_model. Не
    эвристика (в отличие от отклонённого в этапе 1 блока 1.11 общего поля
    "автор" на AuditLog — там для событий вообще не было единообразного
    актёра, угадывать по одному из id значило бы иногда врать): здесь
    актёр известен точно и всегда из контекста HTTP-запроса Django Admin."""
    contractor_id: int
    decision: str
    rejection_reason: str
    changed_by_user_id: int


@dataclass(frozen=True)
class PasswordResetRequested(DomainEvent):
    """Запрошен сброс пароля (RequestPasswordResetView, этап 2 блока
    «Сброс пароля»). Публикуется ТОЛЬКО если email найден — иначе AuditLog
    стал бы каналом перебора адресов, тем же самым, который закрывает
    единообразный ответ эндпоинта независимо от существования email."""
    user_id: int


@dataclass(frozen=True)
class PasswordResetCompleted(DomainEvent):
    """Пароль реально сменён по ссылке сброса (ConfirmPasswordResetView,
    этап 2). Отдельный класс от PasswordChanged ниже — метод смены
    различается через event_type в AuditLog, не отдельным полем payload."""
    user_id: int


@dataclass(frozen=True)
class PasswordChanged(DomainEvent):
    """Пароль сменён залогиненным пользователем через ChangePasswordView
    (знает текущий пароль — путь без токена сброса)."""
    user_id: int


@dataclass(frozen=True)
class UserLoggedIn(DomainEvent):
    """Успешный вход через POST /login/. НЕ публикуется на token/refresh/ —
    тот происходит автоматически каждые ACCESS_TOKEN_LIFETIME (15 минут)
    при открытой вкладке, это молчаливое продление сессии, не действие
    человека; логировать его как «вход» утопило бы реальный сигнал в
    шуме (до 4 записей в час на одну открытую вкладку)."""
    user_id: int


@dataclass(frozen=True)
class EmailVerified(DomainEvent):
    """Почта подтверждена самим пользователем по реальной ссылке из письма
    (VerifyEmailView) — штатный путь. Публикуется ТОЛЬКО на реальном
    переходе False→True; повторное идемпотентное подтверждение уже
    подтверждённой почты не публикует повторно.

    Отдельный класс от EmailVerificationChangedByAdmin ниже — тем же
    приёмом, что PasswordChanged/PasswordResetCompleted различают путь
    смены пароля через event_type, не общим полем "метод"."""
    user_id: int


@dataclass(frozen=True)
class EmailVerificationChangedByAdmin(DomainEvent):
    """is_email_verified изменён вручную оператором в Django Admin — в
    обход штатной ссылки (поддержка человека, которому письмо реально не
    дошло). is_email_verified в payload — само новое значение (флаг мог
    измениться в любую сторону, не только False→True).

    changed_by_user_id — id оператора (request.user в save_model), не
    email/имя: id достаточно, чтобы найти человека в UserAdmin, дублировать
    PII в журнал незачем. Действие обходит гейт подтверждения почты —
    без автора запись показывала бы факт изменения, но не того, кто его
    сделал (та же логика, что и у ContractorVerificationDecided выше)."""
    user_id: int
    is_email_verified: bool
    changed_by_user_id: int
