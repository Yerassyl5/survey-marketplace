# Модель Site — первоклассная сущность (адрес, точка/контур PostGIS,
# кадастровый номер, владелец-заказчик) — architecture.md §4.2.
from __future__ import annotations

from django.conf import settings
from django.contrib.gis.db import models as gis_models
from django.db import models


class Site(models.Model):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="sites",
        limit_choices_to={"role": "customer"},
    )
    address = models.CharField(max_length=512)
    # Точка или контур участка на карте — одно геометрическое поле без
    # жёсткого типа, чтобы не плодить отдельные point/contour-поля.
    geometry = gis_models.GeometryField(srid=4326)
    cadastral_number = models.CharField(max_length=64, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return self.address
