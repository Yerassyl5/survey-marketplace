from __future__ import annotations

from django.db import DataError
from drf_spectacular.utils import extend_schema, OpenApiResponse
from rest_framework import permissions, status
from rest_framework.parsers import MultiPartParser
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Role
from apps.sites.models import Site
from common.events import publish

from .events import GeometryUploaded
from .models import City, Region
from .serializers import GeoCitySerializer, GeoRegionSerializer
from .services import parse_geo_file


class _IsCustomer(permissions.BasePermission):
    def has_permission(self, request, view) -> bool:
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role == Role.CUSTOMER
        )


@extend_schema(
    tags=["geo"],
    summary="Загрузить геометрию объекта из файла (KML / GeoJSON)",
    description=(
        "Принимает .kml, .geojson или .json (≤ 10 МБ). "
        "Парсит геометрию и сохраняет в Site.geometry. "
        "Доступно только владельцу объекта (заказчику)."
    ),
    request={"multipart/form-data": {"type": "object", "properties": {"file": {"type": "string", "format": "binary"}}}},
    responses={
        200: OpenApiResponse(description="Геометрия обновлена"),
        400: OpenApiResponse(description="Ошибка валидации файла"),
        403: OpenApiResponse(description="Нет доступа"),
        404: OpenApiResponse(description="Объект не найден"),
    },
)
class SiteGeometryUploadView(APIView):
    parser_classes = [MultiPartParser]
    permission_classes = [permissions.IsAuthenticated, _IsCustomer]

    def post(self, request: Request, site_id: int) -> Response:
        try:
            site = Site.objects.get(pk=site_id, owner=request.user)
        except Site.DoesNotExist:
            return Response({"detail": "Объект не найден."}, status=status.HTTP_404_NOT_FOUND)

        file = request.FILES.get("file")
        if not file:
            return Response(
                {"detail": "Поле 'file' обязательно."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # parse_geo_file поднимает ValidationError → DRF возвращает 400 сам
        geometry, fmt = parse_geo_file(file)

        try:
            site.geometry = geometry
            site.save(update_fields=["geometry", "updated_at"])
        except DataError as exc:
            return Response(
                {"detail": f"Не удалось сохранить геометрию: {exc}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        publish(GeometryUploaded(site_id=site.id, file_format=fmt))

        return Response({"detail": "Геометрия обновлена.", "format": fmt}, status=status.HTTP_200_OK)


@extend_schema(
    tags=["geo"],
    summary="Справочник КАТО (области, районы, города) одним деревом",
    description=(
        "Республиканские города (Астана/Алматы/Шымкент, без области-родителя) "
        "отдельным списком + все области с вложенными городами и районами. "
        "Датасет небольшой и почти статичный — фронтенд запрашивает один раз "
        "и строит каскадный фильтр локации на клиенте, без запроса на каждый уровень."
    ),
    responses={200: OpenApiResponse(description="Дерево справочника локаций")},
)
class GeoLocationsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request: Request) -> Response:
        republican_cities = City.objects.filter(region__isnull=True).order_by("name")
        regions = Region.objects.prefetch_related("cities", "districts").order_by("name")
        return Response({
            "republican_cities": GeoCitySerializer(republican_cities, many=True).data,
            "regions": GeoRegionSerializer(regions, many=True).data,
        })
