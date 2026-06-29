from dataclasses import dataclass

from common.events import DomainEvent


@dataclass(frozen=True)
class RequestCreated(DomainEvent):
    request_id: int
    niche: str
    city: str
    site_id: int


@dataclass(frozen=True)
class BidPlaced(DomainEvent):
    request_id: int
    bid_id: int
    contractor_id: int


@dataclass(frozen=True)
class RequestAwarded(DomainEvent):
    request_id: int
    contractor_id: int


@dataclass(frozen=True)
class ResultSubmitted(DomainEvent):
    request_id: int


@dataclass(frozen=True)
class RequestAccepted(DomainEvent):
    """Статус «принято» ставит только заказчик (инвариант №2)."""
    request_id: int


@dataclass(frozen=True)
class DealCompleted(DomainEvent):
    request_id: int


@dataclass(frozen=True)
class ResultReturned(DomainEvent):
    """Заказчик вернул результат на доработку."""
    request_id: int
