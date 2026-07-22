from __future__ import annotations

from django.db.models import Count

from .models import Request, RequestStatus


def get_completed_counts(contractor_ids: list[int]) -> dict[int, int]:
    """Число заявок, ПРИНЯТЫХ заказчиком (status=accepted) — не awarded/
    result_submitted, публичный тип границы модуля (architecture.md §1), по
    образцу reputation.services.get_ratings_for_contractors: вызывающая
    сторона импортирует только эту функцию, не models.Request напрямую.

    assigned_contractor как источник — корректно РОВНО до тех пор, пока в
    системе нет переназначения исполнителя после award — сейчас
    assigned_contractor пишется один раз в AwardView и нигде больше не
    меняется (тот же инвариант, что уже задокументирован у Review.contractor
    в reputation/models.py). Если переназначение когда-либо появится — это
    место придётся чинить синхронно с ним.

    Один запрос на весь список id, не по одному на исполнителя — тот же
    принцип, что get_ratings_for_contractors."""
    if not contractor_ids:
        return {}
    rows = (
        Request.objects.filter(assigned_contractor_id__in=contractor_ids, status=RequestStatus.ACCEPTED)
        .values("assigned_contractor_id")
        .annotate(count=Count("id"))
    )
    return {row["assigned_contractor_id"]: row["count"] for row in rows}
