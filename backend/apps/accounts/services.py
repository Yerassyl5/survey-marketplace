"""
Публичная граница модуля accounts (architecture.md §1 — «публичные сервисы
модулей в памяти»). Другие модули читают данные пользователей ТОЛЬКО через
функции этого файла, не импортируя accounts.models напрямую — по образцу
marketplace.services/reputation.services.

Особенно важно для notifications: тот модуль подписан на события всех
остальных приложений и со временем будет читать данные из них всех — без
явной границы здесь он бы через полгода знал внутренности всего проекта
(разведка перед этапом 1 блока 1.11, docs/progress.md).
"""
from __future__ import annotations

from dataclasses import dataclass

from django.core import signing

from .models import User

# Домен подписи отдельный от других будущих signed-токенов (например,
# сброса пароля, этап 5) — salt разводит их так, что токен одного
# назначения нельзя скормить проверке другого, даже структурно совпадающей
# по формату (просто {"user_id": int}).
EMAIL_VERIFICATION_SALT = "accounts.email-verification"
# 3 суток — подтверждение почты менее чувствительно ко времени, чем сброс
# пароля (протухшая ссылка стоит лишнего клика «отправить повторно», не
# риска угона аккаунта); более длинное окно снижает нагрузку на
# поддержку от тех, кто открывает почту не в тот же день (решение
# пользователя, этап 3 блока 1.11).
EMAIL_VERIFICATION_TTL = 60 * 60 * 24 * 3


class EmailVerificationTokenExpired(Exception):
    """Токен подписан верно, но истёк TTL (django.core.signing.SignatureExpired)."""


class EmailVerificationTokenInvalid(Exception):
    """Токен испорчен/подделан (django.core.signing.BadSignature) либо
    структурно не то, что мы подписывали."""


@dataclass(frozen=True)
class ContactInfo:
    """Публичный тип границы модуля — email/имя пользователя для писем и
    т.п., без раскрытия остальных полей User (роль, ИИН/БИН, статус
    верификации и т.д.) вызывающему коду."""
    email: str
    full_name: str


def get_contact_info(user_id: int) -> ContactInfo | None:
    """None, если пользователь не найден — вызывающий код сам решает, что
    делать (пропустить письмо, залогировать), не получает исключение из
    чужого модуля."""
    user = User.objects.filter(pk=user_id).only("email", "full_name").first()
    if user is None:
        return None
    return ContactInfo(email=user.email, full_name=user.full_name)


def generate_email_verification_token(user_id: int) -> str:
    """Stateless — HMAC на SECRET_KEY через django.core.signing, без записи
    в БД: подтверждение почты идемпотентно (повторная простановка True не
    вредна, в отличие от смены пароля), значит не нужен ни одноразовый
    расход токена, ни чистка просроченных записей. НЕ django.contrib.auth.
    tokens.PasswordResetTokenGenerator — тот завязан на user.password И
    user.last_login (_make_hash_value), значит вход с ДРУГОГО устройства
    между письмом и кликом по ссылке меняет last_login и преждевременно
    инвалидирует токен, хотя к подтверждению почты это не имеет отношения
    — для сброса пароля такая привязка к last_login задумана как защита,
    для этой задачи это дефект, найденный при планировании этапа 3."""
    return signing.dumps({"user_id": user_id}, salt=EMAIL_VERIFICATION_SALT)


def verify_email_verification_token(token: str) -> int:
    """Возвращает user_id при успехе. EmailVerificationTokenExpired/
    EmailVerificationTokenInvalid — различимые исключения, не одно общее:
    фронту (этап 4) пригодятся разные тексты («ссылка устарела, запросите
    новую» vs «ссылка повреждена»)."""
    try:
        payload = signing.loads(token, salt=EMAIL_VERIFICATION_SALT, max_age=EMAIL_VERIFICATION_TTL)
    except signing.SignatureExpired:
        raise EmailVerificationTokenExpired
    except signing.BadSignature:
        raise EmailVerificationTokenInvalid
    try:
        return int(payload["user_id"])
    except (KeyError, TypeError, ValueError):
        raise EmailVerificationTokenInvalid
