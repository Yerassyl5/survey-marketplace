from __future__ import annotations

from dataclasses import dataclass

from django.db.models import Count

from .models import Bid, Request, RequestStatus


@dataclass(frozen=True)
class RequestSummary:
    """Публичный тип границы модуля (architecture.md §1), по образцу
    accounts.services.ContactInfo. Минимум полей, нужных потребителям вне
    marketplace для писем/уведомлений — не весь Request."""
    customer_id: int
    work_type_label: str
    location_label: str


def get_request_summary(request_id: int) -> RequestSummary | None:
    """None, если заявка не найдена — вызывающий код сам решает, что делать
    (пропустить письмо, залогировать), не получает исключение из чужого
    модуля (тот же приём, что accounts.services.get_contact_info)."""
    req = (
        Request.objects.filter(pk=request_id)
        .only("customer_id", "work_type", "location_type", "city", "district")
        .first()
    )
    if req is None:
        return None
    return RequestSummary(
        customer_id=req.customer_id,
        work_type_label=req.get_work_type_display(),
        location_label=req.location_label,
    )


def count_bids(request_id: int) -> int:
    """Голый счётчик, без встроенной семантики «первый»/«не первый» —
    эта бизнес-логика (например, «письмо только на первый отклик»,
    notifications.subscribers.on_bid_placed) остаётся на стороне
    вызывающего кода, marketplace просто отдаёт факт."""
    return Bid.objects.filter(request_id=request_id).count()


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
