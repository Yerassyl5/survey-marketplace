# Справочник административно-территориального деления РК (КАТО).
# Общий географический ресурс — используется заявками (marketplace.Request)
# и в будущем объектами (sites.Site), поэтому живёт в geo, а не в marketplace
# (architecture.md §4.6, §4.2).
from __future__ import annotations

from django.db import models


class Region(models.Model):
    """Область. Города республиканского значения (Астана/Алматы/Шымкент)
    сюда не входят — у них нет области-родителя (см. City.region)."""
    name = models.CharField(max_length=128, unique=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class District(models.Model):
    """Район внутри области."""
    region = models.ForeignKey(Region, on_delete=models.PROTECT, related_name="districts")
    name = models.CharField(max_length=128)

    class Meta:
        unique_together = ("region", "name")
        ordering = ["region__name", "name"]

    def __str__(self) -> str:
        return f"{self.name}, {self.region.name}"


class City(models.Model):
    """Город ОБЛАСТНОГО значения (не районного — см. docs/sessions).
    region=None — город РЕСПУБЛИКАНСКОГО значения (Астана, Алматы, Шымкент),
    не входит ни в одну область."""
    region = models.ForeignKey(
        Region, on_delete=models.PROTECT, related_name="cities", null=True, blank=True,
    )
    name = models.CharField(max_length=128)

    class Meta:
        unique_together = ("region", "name")
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name
