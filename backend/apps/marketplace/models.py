# Модели заявок и откликов (architecture.md §4.3).
# Двусторонние вехи: open → awarded → result_submitted → accepted.
from __future__ import annotations

from django.conf import settings
from django.contrib.gis.db import models as gis_models
from django.db import models


class WorkType(models.TextChoices):
    GEODESY = "geodesy", "Геодезия"
    GEOLOGY = "geology", "Геология"
    GEOPHYSICS = "geophysics", "Геофизика"
    ECOLOGY = "ecology", "Экология"
    OTHER = "other", "Прочее"


class RequestStatus(models.TextChoices):
    OPEN = "open", "Открыта"
    AWARDED = "awarded", "Исполнитель выбран"
    RESULT_SUBMITTED = "result_submitted", "Результат сдан"
    ACCEPTED = "accepted", "Принято заказчиком"


class BidStatus(models.TextChoices):
    PENDING = "pending", "На рассмотрении"
    SELECTED = "selected", "Выбран"
    REJECTED = "rejected", "Отклонён"


class Request(models.Model):
    site = models.ForeignKey(
        "sites.Site",
        on_delete=models.PROTECT,
        related_name="requests",
    )
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="requests",
        limit_choices_to={"role": "customer"},
    )
    work_type = models.CharField(max_length=20, choices=WorkType.choices)
    description = models.TextField()
    tz_file = models.FileField(upload_to="marketplace/tz/", blank=True)
    # Уточняющая геометрия на заявке — необязательна, участок уже есть на объекте (Site)
    geometry = gis_models.GeometryField(srid=4326, null=True, blank=True)
    city = models.CharField(max_length=128)
    status = models.CharField(
        max_length=20,
        choices=RequestStatus.choices,
        default=RequestStatus.OPEN,
    )
    assigned_contractor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="awarded_requests",
    )
    # Файл результата и комментарий — заполняет исполнитель при сдаче
    result_file = models.FileField(upload_to="marketplace/results/", blank=True)
    result_note = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"{self.get_work_type_display()} — {self.city} (#{self.pk})"


class Bid(models.Model):
    request = models.ForeignKey(Request, on_delete=models.CASCADE, related_name="bids")
    contractor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="bids",
        limit_choices_to={"role": "contractor"},
    )
    comment = models.TextField(blank=True)
    status = models.CharField(
        max_length=20,
        choices=BidStatus.choices,
        default=BidStatus.PENDING,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        # Один исполнитель — один отклик на заявку
        unique_together = ("request", "contractor")

    def __str__(self) -> str:
        return f"Отклик #{self.pk}: {self.contractor.email} → заявка #{self.request_id}"
