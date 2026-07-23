"""Celery-задачи модуля notifications (architecture.md §4.7).

Этап 0 блока 1.11 — только транспорт (шаблон → SMTP → Mailpit/прод-провайдер).
Здесь нет подписчиков на доменные события и нет писем конкретных сценариев
(подтверждение почты, «вас рассматривают» и т.п.) — это бизнес-логика
следующих этапов, вызывающая send_email_task как готовый примитив.

Тон писем (для всех будущих шаблонов в emails/, не только тестового):
обращение на «Вы», нейтральный деловой тон, без панибратства — аудитория
B2B (инженеры-изыскатели, застройщики), не потребительский сервис.
"""
from __future__ import annotations

import smtplib
import socket
from typing import Any

from celery import shared_task
from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string

# Проверено фактом (разведка перед реализацией): недоступный SMTP-хост
# долетает до кода как socket.gaierror (DNS не резолвится) или
# ConnectionRefusedError (порт закрыт), НЕ как smtplib.SMTPException —
# тот покрывает только протокольные ошибки (плохой ответ сервера, отказ
# авторизации). TimeoutError — третий канонический сценарий (хост
# резолвится, порт открыт, но не отвечает); достижим только благодаря
# EMAIL_TIMEOUT в settings.py (без него socket виснет без ограничения).
#
# Список узкий не потому, что ConnectionError/TimeoutError сами по себе
# специфичны для SMTP (это НЕ так — это общие сетевые исключения), а потому,
# что внутри ЭТОЙ задачи единственный сетевой вызов — попытка SMTP-
# соединения, значит именно в этом стеке они могут прийти только оттуда.
# Если в будущем в send_email_task добавится другой сетевой I/O (например,
# прямой вызов MinIO/внешнего API) — этот кортеж НАДО сузить заново, иначе
# ретрай начнёт маскировать сбои того нового вызова.
_SMTP_TRANSPORT_ERRORS = (smtplib.SMTPException, socket.gaierror, ConnectionError, TimeoutError)


@shared_task(
    bind=True,
    autoretry_for=_SMTP_TRANSPORT_ERRORS,
    max_retries=3,
    retry_backoff=True,
    retry_backoff_max=60,
    retry_jitter=True,
)
def send_email_task(
    self, to_email: str, subject: str, template_name: str, context: dict[str, Any]
) -> None:
    """Отправляет письмо в двух версиях — plain text + HTML.

    Часть почтовых клиентов и спам-фильтров режет письма без текстовой
    части, поэтому EmailMultiAlternatives (plain — body, html — alternative),
    не send_mail(html_message=...) (тот плоский, без гарантии text-версии).

    template_name — базовое имя БЕЗ расширения, ожидает рядом оба файла:
    emails/{template_name}.txt и emails/{template_name}.html. Единое базовое
    имя — вызывающему коду не нужно помнить и передавать оба пути отдельно,
    а naming-конвенция гарантирует, что text-версия не забудется при
    добавлении нового письма (render_to_string кинет TemplateDoesNotExist,
    если забыть один из двух файлов — это НЕ SMTP-ошибка транспорта, не
    ретраится, падает сразу и заметно).

    site_url добавляется в контекст здесь централизованно (не в каждом
    вызывающем подписчике) — emails/_base.{txt,html} (этап 2 блока 1.11)
    ссылается на {{ site_url }} в шапке/подписи, общей для всех писем;
    так шаблон, унаследованный от базового, всегда получает эту переменную,
    даже если конкретный подписчик о ней не думал.
    """
    full_context: dict[str, Any] = {"site_url": settings.FRONTEND_URL, **context}
    text_body = render_to_string(f"emails/{template_name}.txt", full_context)
    html_body = render_to_string(f"emails/{template_name}.html", full_context)

    message = EmailMultiAlternatives(
        subject=subject,
        body=text_body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[to_email],
    )
    message.attach_alternative(html_body, "text/html")
    message.send()
