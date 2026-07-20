from __future__ import annotations

from dataclasses import dataclass

from django.db.models import Avg, Count

from .models import Review


@dataclass(frozen=True)
class RatingData:
    """Публичный тип границы модуля (architecture.md §1: «публичные сервисы
    модулей в памяти»). marketplace импортирует ТОЛЬКО этот датакласс и
    функцию ниже — не models.Review, не голый dict/кортеж."""
    avg: float
    count: int


def get_ratings_for_contractors(contractor_ids: list[int]) -> dict[int, RatingData]:
    """Агрегат рейтинга на лету (architecture.md §4.5 — денормализованного
    поля нет). Один запрос на весь список id, не по одному на исполнителя —
    тот же принцип, что today_count в marketplace/views.py::RequestPagination
    (агрегат отдельным запросом, а не N+1 на объект). float(...) — явно,
    чтобы DRF JSONEncoder не сериализовал Decimal из Avg() как строку вместо
    числа (rest_framework.utils.encoders.JSONEncoder так делает с Decimal —
    подтверждено тестом test_rating_avg_serializes_as_number_not_string)."""
    if not contractor_ids:
        return {}
    rows = (
        Review.objects.filter(contractor_id__in=contractor_ids)
        .values("contractor_id")
        .annotate(avg=Avg("rating"), count=Count("id"))
    )
    return {
        row["contractor_id"]: RatingData(avg=round(float(row["avg"]), 1), count=row["count"])
        for row in rows
    }
