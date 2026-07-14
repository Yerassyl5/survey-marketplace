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
class BidConsidered(DomainEvent):
    """Заказчик рассмотрел отклик — момент раскрытия телефона исполнителя
    (architecture.md §4.3). Публикуется только при реальном переходе
    considered_at NULL → значение, не при повторном вызове consider."""
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


@dataclass(frozen=True)
class BidWithdrawn(DomainEvent):
    """Исполнитель отозвал отклик (только пока не рассмотрен — WithdrawBidView).
    bid_id указывает на уже удалённую строку (hard delete) — событие остаётся
    единственным следом отзыва в системе, значения захвачены до удаления."""
    request_id: int
    bid_id: int
    contractor_id: int
