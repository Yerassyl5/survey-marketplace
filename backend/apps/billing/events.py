from dataclasses import dataclass

from common.events import DomainEvent


@dataclass(frozen=True)
class SubscriptionActivated(DomainEvent):
    contractor_id: int
