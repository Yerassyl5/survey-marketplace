"""
Публичная граница модуля notifications — наружу, в отличие от
subscribers.py (который слушает события ИЗНУТРИ). accounts.views нужно
переслать письмо подтверждения вне события (переотправка) — вместо
прямого вызова tasks.send_email_task (внутренний примитив транспорта)
вызывающий код получает этот единственный явный вход. Один источник
истины про формат ссылки подтверждения — не дублируется между
подписчиком регистрации (subscribers.py::on_user_registered) и
ResendVerificationView.
"""
from __future__ import annotations

from datetime import datetime

from django.conf import settings
from django.db.models import Max

from .models import AuditLog
from .tasks import send_email_task


def send_verification_email(to_email: str, full_name: str, token: str) -> None:
    verify_url = f"{settings.FRONTEND_URL}/ru/verify-email?token={token}"
    send_email_task.delay(
        to_email=to_email,
        subject="Подтвердите почту — ПроГео",
        template_name="email_verification",
        context={"full_name": full_name, "verify_url": verify_url},
    )


def send_password_reset_email(to_email: str, full_name: str, token: str) -> None:
    """Вызывается вне доменного события, тем же способом, что
    send_verification_email — RequestPasswordResetView не публикует
    отдельное событие ради отправки письма (PasswordResetRequested,
    accounts/events.py, публикуется отдельно, только для журнала)."""
    reset_url = f"{settings.FRONTEND_URL}/ru/reset-password?token={token}"
    send_email_task.delay(
        to_email=to_email,
        subject="Сброс пароля — ПроГео",
        template_name="password_reset",
        context={"full_name": full_name, "reset_url": reset_url},
    )


def get_last_logins(user_ids: list[int]) -> dict[int, datetime]:
    """Момент последнего входа (событие accounts.UserLoggedIn) для списка
    пользователей — один агрегатный запрос (GROUP BY по ключу JSONField,
    Max(created_at)), не по одному на пользователя. Тот же принцип, что
    marketplace.services.get_completed_counts/reputation.services.
    get_ratings_for_contractors — публичная граница модуля, вызывающая
    сторона (accounts/admin.py, колонка «Последний вход») получает
    только эту функцию, не импортирует AuditLog напрямую (инвариант №12).

    Отсутствующие в результате id — пользователь без единого входа (ещё
    не логинился) — вызывающая сторона сама решает, что показать (у нас —
    прочерк, не пустая ячейка)."""
    if not user_ids:
        return {}
    rows = (
        AuditLog.objects.filter(event_type="accounts.UserLoggedIn", payload__user_id__in=user_ids)
        .values("payload__user_id")
        .annotate(last_login=Max("created_at"))
    )
    return {int(row["payload__user_id"]): row["last_login"] for row in rows}
