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
    UNDER_REVIEW = "under_review", "Рассмотрение исполнителей"
    AWARDED = "awarded", "В работе"
    RESULT_SUBMITTED = "result_submitted", "Результат сдан"
    ACCEPTED = "accepted", "Принято заказчиком"


class LocationType(models.TextChoices):
    CITY = "city", "Город"
    DISTRICT = "district", "Район"


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
    # Локация — город ИЛИ область+район через справочник geo.City/geo.District,
    # не свободным текстом. Условная обязательность (city при location_type=city,
    # district при location_type=district) проверяется в сериализаторе.
    location_type = models.CharField(max_length=20, choices=LocationType.choices)
    city = models.ForeignKey(
        "geo.City", on_delete=models.PROTECT, null=True, blank=True, related_name="requests",
    )
    district = models.ForeignKey(
        "geo.District", on_delete=models.PROTECT, null=True, blank=True, related_name="requests",
    )
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
    # Текстовый комментарий к результату — заполняет исполнитель при сдаче; файлы — в ResultFile
    result_note = models.TextField(blank=True)
    # Короткая пометка заказчика для потенциальных исполнителей (не второе описание,
    # ограничена длиной) — сужает круг откликающихся: «срочно», «оплата наличными» и т.п.
    # Заполняется через админку, пока нет формы создания заявки заказчиком на фронте.
    contractor_note = models.CharField(max_length=300, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def location_label(self) -> str:
        """«Кокшетау» для города, «Акмолинская область, Аршалынский район» для района."""
        if self.location_type == LocationType.CITY and self.city_id:
            return self.city.name
        if self.location_type == LocationType.DISTRICT and self.district_id:
            return f"{self.district.region.name}, {self.district.name}"
        return ""

    def __str__(self) -> str:
        return f"{self.get_work_type_display()} — {self.location_label} (#{self.pk})"


class Bid(models.Model):
    request = models.ForeignKey(Request, on_delete=models.CASCADE, related_name="bids")
    contractor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="bids",
        limit_choices_to={"role": "contractor"},
    )
    comment = models.TextField(blank=True)
    # Цена и срок — предложение ИСПОЛНИТЕЛЯ, публикуются вместе с откликом
    # (не хранятся на Request: заказчик размещает только объём работ,
    # исполнители сами предлагают цену/срок, заказчик выбирает из предложений).
    # Nullable на уровне модели (тесты/админка создают Bid напрямую без них),
    # но обязательны при создании через API — см. BidSerializer.
    price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    deadline_days = models.PositiveIntegerField(null=True, blank=True)
    status = models.CharField(
        max_length=20,
        choices=BidStatus.choices,
        default=BidStatus.PENDING,
    )
    # Метка «заказчик рассмотрел отклик» — одновременно момент раскрытия телефона
    # исполнителя (architecture.md §4.3). Независима от RequestStatus: у заявки
    # могут быть и рассмотренные, и нерассмотренные отклики одновременно.
    considered_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        # Один исполнитель — один отклик на заявку
        unique_together = ("request", "contractor")

    def __str__(self) -> str:
        return f"Отклик #{self.pk}: {self.contractor.email} → заявка #{self.request_id}"


class ResultFile(models.Model):
    """Файл результата работы исполнителя; один или несколько на одну заявку."""
    request = models.ForeignKey(Request, on_delete=models.CASCADE, related_name="result_files")
    file = models.FileField(upload_to="marketplace/results/")
    original_name = models.CharField(max_length=255, blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"Файл результата #{self.pk} → заявка #{self.request_id}"
