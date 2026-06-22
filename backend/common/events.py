"""
Единый интерфейс доменных событий для всех модулей-приложений.

Модули не общаются по HTTP (это монолит) — только публичные сервисы
в памяти и доменные события (architecture.md §1, §5, §7).

Каждый app определяет свои события в собственном events.py, наследуя
DomainEvent, и публикует их через publish(). Подписчики (notifications,
analytics, reputation и др.) регистрируются через subscribe().
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

EventHandler = Callable[["DomainEvent"], None]


@dataclass(frozen=True)
class DomainEvent:
    """Базовый класс доменного события. Конкретные события — в apps/*/events.py."""


_subscribers: dict[type, list[EventHandler]] = {}


def subscribe(event_type: type[DomainEvent], handler: EventHandler) -> None:
    _subscribers.setdefault(event_type, []).append(handler)


def publish(event: DomainEvent) -> None:
    for handler in _subscribers.get(type(event), []):
        handler(event)
