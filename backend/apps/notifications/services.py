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
