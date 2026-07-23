"""
Единый интерфейс доменных событий для всех модулей-приложений.

Модули не общаются по HTTP (это монолит) — только публичные сервисы
в памяти и доменные события (architecture.md §1, §5, §7).

Каждый app определяет свои события в собственном events.py, наследуя
DomainEvent, и публикует их через publish(). Подписчики (notifications,
analytics, reputation и др.) регистрируются через subscribe() — на
конкретный тип события — или subscribe_all() — на любое событие любого
типа (используется журналом AuditLog, которому нужна полнота, а не
конкретный тип; см. apps/notifications/subscribers.py).
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Callable

logger = logging.getLogger(__name__)

EventHandler = Callable[["DomainEvent"], None]


@dataclass(frozen=True)
class DomainEvent:
    """Базовый класс доменного события. Конкретные события — в apps/*/events.py."""


_subscribers: dict[type, list[EventHandler]] = {}
_global_subscribers: list[EventHandler] = []


def subscribe(event_type: type[DomainEvent], handler: EventHandler) -> None:
    _subscribers.setdefault(event_type, []).append(handler)


def subscribe_all(handler: EventHandler) -> None:
    """Подписка на ЛЮБОЙ тип события — отдельный список от _subscribers,
    publish() вызывает типовые обработчики первыми, затем глобальные
    (порядок — решение продукта, не влияет на надёжность: см. изоляцию
    ошибок в publish() ниже)."""
    _global_subscribers.append(handler)


def publish(event: DomainEvent) -> None:
    """Сбой одного подписчика не должен блокировать остальных — в частности,
    журнал (subscribe_all) должен получить событие, даже если, например,
    типовой обработчик (письмо) упал раньше него в списке — и не должен
    всплывать в вызывающий код: publish() вызывается синхронно из вьюх
    ПОСЛЕ уже совершённого и закоммиченного бизнес-действия (например,
    ConsiderBidView — Bid.considered_at уже обновлён к моменту publish()),
    падение подписчика не должно превращать успешный запрос в 500. По
    аналогии с Django Signal.send_robust()."""
    handlers = list(_subscribers.get(type(event), [])) + list(_global_subscribers)
    for handler in handlers:
        try:
            handler(event)
        except Exception:
            logger.exception(
                "Подписчик %r упал на событии %s", handler, type(event).__name__
            )
