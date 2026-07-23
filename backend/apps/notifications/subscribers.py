"""Подписчики модуля notifications на доменные события других приложений.

Регистрируются один раз через register_subscribers() (вызывается из
apps.py::NotificationsConfig.ready()). Idempotency-guard (_registered) —
не фикс найденного бага: эмпирическая проверка (docs/progress.md, разведка
перед этапом 1 блока 1.11) показала, что ready() срабатывает ровно один
раз в каждом обслуживающем HTTP-процессе (parent-watcher под autoreload —
отдельный процесс, HTTP не обслуживает). Флаг — страховка почти без
стоимости на случай сценариев, которые не тестировались (тестовый раннер,
будущий сервер запуска).

Правило для всех писем этого модуля (этап 2 блока 1.11, разведка перед
RequestAwarded): почта не должна знать/показывать больше, чем показывает
сам продукт в интерфейсе. Если сериализатор чего-то не отдаёт получателю
письма — письмо тоже этого не содержит, даже если технически данные под
рукой.

Межмодульное чтение — ТОЛЬКО через сервисный слой (accounts.services,
marketplace.services), ни одного прямого импорта чужих models.* здесь
нет (ретрофит on_bid_considered на marketplace.services.get_request_summary
в этапе 2 — до этого было одно исключение, импорт apps.marketplace.models.
Request из этапа 1).
"""
from __future__ import annotations

import dataclasses

from django.conf import settings

from apps.accounts.events import ContractorVerificationDecided
from apps.accounts.services import get_contact_info
from apps.marketplace.events import BidConsidered, BidPlaced, RequestAwarded
from apps.marketplace.services import count_bids, get_request_summary
from common.events import DomainEvent, subscribe, subscribe_all

from .models import AuditLog
from .tasks import send_email_task

_registered = False


def on_bid_considered(event: BidConsidered) -> None:
    """Письмо исполнителю «вас рассматривают».

    Инвариант №9 — письмо не должно нести НИЧЕГО про наличие/число других
    откликов на заявку. Гарантия по конструкции: этот код не делает ни
    одного запроса к Bid (ни считает, ни фильтрует) — только accounts
    (контакт получателя) и marketplace.get_request_summary (тип работ/
    локация, которые сам исполнитель уже видел, откликнувшись на эту
    заявку — не новость). Контекст письма — СТРОГО три ключа ниже, ничего
    производного от чужих откликов туда попасть не может, потому что такие
    данные здесь вообще не запрашиваются.
    """
    contact = get_contact_info(event.contractor_id)
    if contact is None:
        return
    summary = get_request_summary(event.request_id)
    if summary is None:
        return
    send_email_task.delay(
        to_email=contact.email,
        subject="Вас рассматривают — ПроГео",
        template_name="bid_considered",
        context={
            "contractor_name": contact.full_name,
            "work_type_label": summary.work_type_label,
            "location_label": summary.location_label,
        },
    )


def on_request_awarded(event: RequestAwarded) -> None:
    """Письмо победителю «вас выбрали».

    Инвариант №9 здесь неприменим в прежнем виде (торг окончен), но
    правило модуля (см. докстринг файла) — да: RequestFeedDetailSerializer
    не отдаёт победителю ни телефон, ни email заказчика ни в одном поле
    (проверено чтением кода при планировании этапа 2) — заказчик сам
    звонит исполнителю, используя телефон, раскрытый на BidConsidered, не
    наоборот. Письмо не содержит контактов заказчика по той же причине —
    почта не должна знать больше продукта."""
    contact = get_contact_info(event.contractor_id)
    if contact is None:
        return
    summary = get_request_summary(event.request_id)
    if summary is None:
        return
    send_email_task.delay(
        to_email=contact.email,
        subject="Вас выбрали исполнителем — ПроГео",
        template_name="request_awarded",
        context={
            "contractor_name": contact.full_name,
            "work_type_label": summary.work_type_label,
            "location_label": summary.location_label,
            "request_url": f"{settings.FRONTEND_URL}/ru/requests/{event.request_id}",
        },
    )


def on_bid_placed(event: BidPlaced) -> None:
    """Заказчику — письмо только на ПЕРВЫЙ отклик по заявке (PRODUCT_SPEC
    1.11), не на каждый: count_bids(request_id) должен быть ровно 1 в
    момент обработки этого события.

    Гонка при истинной одновременности (проверено фактом по коду, не
    предположением): ATOMIC_REQUESTS нигде не включён, transaction.atomic()
    вокруг создания Bid нет — INSERT коммитится сразу отдельной операцией
    (autocommit). Окно гонки узкое: доли миллисекунды между коммитом
    одного запроса и COUNT другого, не весь запрос целиком. Два разных
    исполнителя, откликнувшихся на одну заявку почти одновременно,
    теоретически могут оба увидеть count()==1 (Postgres READ COMMITTED не
    блокирует чтение уже закоммиченного, но и не ждёт чужой коммит) →
    заказчику могут прийти два письма «первый отклик» вместо одного.
    Сознательно НЕ закрыто select_for_update() — тот же класс риска, что
    уже принят для WithdrawBidView (см. docs/progress.md техдолг 1.4):
    блокировка строки заявки стоила бы на КАЖДЫЙ отклик постоянно, а
    дефект вероятностный и косметический (дубль письма, не порча данных),
    требует одновременности в доли миллисекунды на одной заявке — при
    ожидаемом трафике MVP не наступит ни разу."""
    if count_bids(event.request_id) != 1:
        return
    summary = get_request_summary(event.request_id)
    if summary is None:
        return
    customer_contact = get_contact_info(summary.customer_id)
    contractor_contact = get_contact_info(event.contractor_id)
    if customer_contact is None or contractor_contact is None:
        return
    # Имя исполнителя в письме — не новое раскрытие: ContractorBriefSerializer
    # отдаёт full_name заказчику в каждом отклике БЕЗ гейта на considered_at
    # (гейт есть только на contractor_phone) — заказчик и так видит имя в
    # интерфейсе. Цену/срок/рейтинг НЕ включаем — те смотрятся в контексте
    # на странице заявки, письмо — указатель «зайдите посмотреть», не
    # замена интерфейсу.
    send_email_task.delay(
        to_email=customer_contact.email,
        subject="Первый отклик на вашу заявку — ПроГео",
        template_name="bid_first_response",
        context={
            "customer_name": customer_contact.full_name,
            "contractor_name": contractor_contact.full_name,
            "work_type_label": summary.work_type_label,
            "location_label": summary.location_label,
            "request_url": f"{settings.FRONTEND_URL}/ru/requests/{event.request_id}",
        },
    )


def on_verification_decided(event: ContractorVerificationDecided) -> None:
    """Результат верификации — одобрено или отказ с причиной (PRODUCT_SPEC
    1.2). Один шаблон с условием на decision, не два файла — оба исхода
    делят почти весь текст (приветствие, подпись), различаются двумя-тремя
    предложениями; второй почти-дублирующий файл рисковал бы разойтись со
    временем. rejection_reason уходит как есть, без модерации (см.
    docs/progress.md — известное свойство, не баг)."""
    contact = get_contact_info(event.contractor_id)
    if contact is None:
        return
    subject = (
        "Верификация одобрена — ПроГео"
        if event.decision == "verified"
        else "Верификация отклонена — ПроГео"
    )
    send_email_task.delay(
        to_email=contact.email,
        subject=subject,
        template_name="verification_decided",
        context={
            "contractor_name": contact.full_name,
            "decision": event.decision,
            "rejection_reason": event.rejection_reason,
            "settings_url": f"{settings.FRONTEND_URL}/ru/settings",
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
    subscribe(RequestAwarded, on_request_awarded)
    subscribe(BidPlaced, on_bid_placed)
    subscribe(ContractorVerificationDecided, on_verification_decided)
    subscribe_all(record_event)
