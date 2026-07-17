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
    # Причина последнего возврата на доработку — заполняет заказчик в ReturnView, обязательна
    # там (пустой возврат бессмыслен). ПЕРЕЗАПИСЫВАЕТСЯ при каждом возврате (тот же принцип,
    # что и result_note выше) — история возвратов, если понадобится, это ResultReturned-события,
    # не поле. Пусто ⟺ заявка ни разу не возвращалась (в awarded попала через AwardView, не
    # через ReturnView) — на этом различии строится баннер «вернули на доработку» у исполнителя.
    return_note = models.TextField(blank=True)
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


class ResultEntryKind(models.TextChoices):
    SUBMITTED = "submitted", "Сдача результата"
    RETURNED = "returned", "Возврат на доработку"
    ACCEPTED = "accepted", "Приёмка результата"


class ResultEntry(models.Model):
    """Запись в ленте результата — «переписка» сдач/возвратов/приёмки, каждая со своими
    файлами и текстом. Заменяет одиночные перезаписываемые Request.result_note/return_note
    (те теряли историю при повторном возврате — 2026-07-17).

    author хранится явно (не выводится сравнением с Request.assigned_contractor/customer) —
    роль полностью определяется kind без сравнений: SUBMITTED физически может создать только
    SubmitResultView (IsContractor), RETURNED/ACCEPTED — только ReturnView/AcceptView
    (IsCustomer). author нужен не для роли, а как честная привязка личности на случай
    будущего переназначения исполнителя/вмешательства модератора — сравнение с ТЕКУЩИМ
    assigned_contractor задним числом переатрибутировало бы старые записи."""
    request = models.ForeignKey(Request, on_delete=models.CASCADE, related_name="result_entries")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    kind = models.CharField(max_length=20, choices=ResultEntryKind.choices)
    # SUBMITTED — комментарий опционален (как раньше result_note); RETURNED — обязателен
    # (причина возврата, проверяется во вьюхе, не на уровне БД); ACCEPTED — всегда "".
    text = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self) -> str:
        return f"{self.get_kind_display()} #{self.pk} → заявка #{self.request_id}"


class ResultFile(models.Model):
    """Файл результата работы исполнителя; один или несколько на одну заявку."""
    request = models.ForeignKey(Request, on_delete=models.CASCADE, related_name="result_files")
    # Какая именно сдача принесла этот файл — nullable ради заявок, заведённых до этого поля
    # (dev-БД, решение 2026-07-17: не бэкфиллить старые файлы синтетическими событиями —
    # проверено фактом, что бэкфилл склеил бы разные сдачи в одну на заявке #38, решили не
    # городить группировку по uploaded_at ради нескольких строк тестовых данных).
    event = models.ForeignKey(ResultEntry, null=True, blank=True, on_delete=models.CASCADE, related_name="files")
    file = models.FileField(upload_to="marketplace/results/")
    original_name = models.CharField(max_length=255, blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"Файл результата #{self.pk} → заявка #{self.request_id}"
