from dataclasses import dataclass

from common.events import DomainEvent


@dataclass(frozen=True)
class SiteCreated(DomainEvent):
    site_id: int
