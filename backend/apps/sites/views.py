from __future__ import annotations

from drf_spectacular.utils import extend_schema
from rest_framework import generics, permissions

from apps.accounts.models import Role

from .models import Site
from .serializers import SiteSerializer


class IsCustomer(permissions.BasePermission):
    def has_permission(self, request, view) -> bool:
        return bool(request.user and request.user.is_authenticated and request.user.role == Role.CUSTOMER)


@extend_schema(tags=["sites"], summary="Список/создание объектов заказчика")
class SiteListCreateView(generics.ListCreateAPIView):
    serializer_class = SiteSerializer
    permission_classes = [IsCustomer]

    def get_queryset(self):
        return Site.objects.filter(owner=self.request.user)


@extend_schema(tags=["sites"], summary="Просмотр объекта заказчика")
class SiteDetailView(generics.RetrieveAPIView):
    serializer_class = SiteSerializer
    permission_classes = [IsCustomer]

    def get_queryset(self):
        return Site.objects.filter(owner=self.request.user)
