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

from django.conf import settings

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
