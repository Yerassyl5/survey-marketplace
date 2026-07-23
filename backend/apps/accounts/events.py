# Доменные события модуля accounts (см. common/events.py).
from __future__ import annotations

from dataclasses import dataclass

from common.events import DomainEvent


@dataclass(frozen=True)
class UserRegistered(DomainEvent):
    user_id: int
    role: str


@dataclass(frozen=True)
class ContractorVerificationDecided(DomainEvent):
    """Модератор принял решение по верификации исполнителя (architecture.md
    §4.1, PRODUCT_SPEC 1.2). Публикуется ТОЛЬКО при реальном переходе
    verification_status на VERIFIED/REJECTED — не на каждое сохранение
    формы в Django Admin (см. ContractorProfileAdmin.save_model).

    rejection_reason — прямо в payload, не отдельным полем на
    ContractorProfile, которое обработчику письма пришлось бы читать
    заново: значение на момент решения уже захвачено здесь, и это же
    значение попадает в журнал AuditLog без дополнительного запроса."""
    contractor_id: int
    decision: str
    rejection_reason: str
