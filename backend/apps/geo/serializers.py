# Справочник КАТО отдаётся одним деревом (небольшой датасет — 17 областей,
# ~170 районов, 42 города), чтобы фронтенд каскадного фильтра не делал
# отдельный запрос на каждый уровень выбора (architecture.md §4.6).
from __future__ import annotations

from rest_framework import serializers

from .models import City, District, Region


class GeoCitySerializer(serializers.ModelSerializer):
    class Meta:
        model = City
        fields = ["id", "name"]


class GeoDistrictSerializer(serializers.ModelSerializer):
    class Meta:
        model = District
        fields = ["id", "name"]


class GeoRegionSerializer(serializers.ModelSerializer):
    cities = GeoCitySerializer(many=True, read_only=True)
    districts = GeoDistrictSerializer(many=True, read_only=True)

    class Meta:
        model = Region
        fields = ["id", "name", "cities", "districts"]
