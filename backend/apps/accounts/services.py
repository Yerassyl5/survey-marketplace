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

from .models import User


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
