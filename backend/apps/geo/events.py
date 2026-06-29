from dataclasses import dataclass

from common.events import DomainEvent


@dataclass(frozen=True)
class GeometryUploaded(DomainEvent):
    site_id: int
    file_format: str  # "kml" | "geojson"
