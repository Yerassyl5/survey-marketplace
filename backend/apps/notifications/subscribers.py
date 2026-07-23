"""Подписчики модуля notifications на доменные события других приложений.

Регистрируются один раз через register_subscribers() (вызывается из
apps.py::NotificationsConfig.ready()). Idempotency-guard (_registered) —
не фикс найденного бага: эмпирическая проверка (docs/progress.md, разведка
перед этапом 1 блока 1.11) показала, что ready() срабатывает ровно один
раз в каждом обслуживающем HTTP-процессе (parent-watcher под autoreload —
отдельный процесс, HTTP не обслуживает). Флаг — страховка почти без
стоимости на случай сценариев, которые не тестировались (тестовый раннер,
будущий сервер запуска).
"""
from __future__ import annotations

import dataclasses

from apps.accounts.services import get_contact_info
from apps.marketplace.events import BidConsidered
from apps.marketplace.models import Request
from common.events import DomainEvent, subscribe, subscribe_all

from .models import AuditLog
from .tasks import send_email_task

_registered = False


def on_bid_considered(event: BidConsidered) -> None:
    """Письмо исполнителю «вас рассматривают».

    Инвариант №9 — письмо не должно нести НИЧЕГО про наличие/число других
    откликов на заявку. Гарантия по конструкции: этот код не делает ни
    одного запроса к Bid (ни считает, ни фильтрует) — только accounts
    (контакт получателя) и marketplace.Request (тип работ/локация, которые
    сам исполнитель уже видел, откликнувшись на эту заявку — не новость).
    Контекст письма — СТРОГО три ключа ниже, ничего производного от чужих
    откликов туда попасть не может, потому что такие данные здесь вообще
    не запрашиваются.
    """
    contact = get_contact_info(event.contractor_id)
    if contact is None:
        return
    req = (
        Request.objects.filter(pk=event.request_id)
        .only("work_type", "location_type", "city", "district")
        .first()
    )
    if req is None:
        return
    send_email_task.delay(
        to_email=contact.email,
        subject="Вас рассматривают — ПроГео",
        template_name="bid_considered",
        context={
            "contractor_name": contact.full_name,
            "work_type_label": req.get_work_type_display(),
            "location_label": req.location_label,
        },
    )


def record_event(event: DomainEvent) -> None:
    """Журнал событий (architecture.md §5, PRODUCT_SPEC 1.9). Подписан на
    ВСЕ события через subscribe_all — принимает базовый DomainEvent, не
    конкретный тип. event_type хранится как "<app_label>.<ClassName>"
    (например "marketplace.BidConsidered"), не голое имя класса — чтобы
    два приложения не столкнулись одноимённым событием в будущем."""
    module_parts = type(event).__module__.split(".")
    app_label = module_parts[-2] if len(module_parts) >= 2 else type(event).__module__
    AuditLog.objects.create(
        event_type=f"{app_label}.{type(event).__name__}",
        payload=dataclasses.asdict(event),
    )


def register_subscribers() -> None:
    global _registered
    if _registered:
        return
    _registered = True
    subscribe(BidConsidered, on_bid_considered)
    subscribe_all(record_event)
