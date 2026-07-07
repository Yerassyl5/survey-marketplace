from __future__ import annotations

from rest_framework_gis.fields import GeometryField
from rest_framework_gis.serializers import GeoFeatureModelSerializer

from common.events import publish

from .events import SiteCreated
from .models import Site


class SiteSerializer(GeoFeatureModelSerializer):
    # GeoFeatureModelSerializer не знает про базовый GeometryField (без явного
    # геометрического подтипа) — без явного объявления поле уходит как ModelField
    # и ломает сериализацию GeoJSON.
    geometry = GeometryField()

    class Meta:
        model = Site
        geo_field = "geometry"
        fields = ["id", "geometry", "owner", "created_at", "updated_at"]
        read_only_fields = ["id", "owner", "created_at", "updated_at"]

    def create(self, validated_data):
        validated_data["owner"] = self.context["request"].user
        site = super().create(validated_data)
        publish(SiteCreated(site_id=site.id))
        return site
