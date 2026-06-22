from dataclasses import dataclass

from common.events import DomainEvent


@dataclass(frozen=True)
class ReviewLeft(DomainEvent):
    request_id: int
    contractor_id: int
    rating: int


@dataclass(frozen=True)
class ComplaintFiled(DomainEvent):
    contractor_id: int
    complaint_id: int
