# Доменные события модуля accounts (см. common/events.py).
from __future__ import annotations

from dataclasses import dataclass

from common.events import DomainEvent


@dataclass(frozen=True)
class UserRegistered(DomainEvent):
    user_id: int
    role: str
