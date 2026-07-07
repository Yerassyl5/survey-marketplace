# Модель Site — первоклассная сущность (точка/контур PostGIS, владелец-заказчик)
# — architecture.md §4.2. Упрощена 2026-07-07: address/cadastral_number убраны
# (не использовались нигде за пределами формы создания — участок идентифицируется
# геометрией, не адресом; Site больше не переиспользуется между заявками).
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
    # Точка или контур участка на карте — одно геометрическое поле без
    # жёсткого типа, чтобы не плодить отдельные point/contour-поля.
    geometry = gis_models.GeometryField(srid=4326)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"Site #{self.pk} ({self.owner.email})"
