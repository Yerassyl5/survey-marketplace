from __future__ import annotations

from drf_spectacular.utils import extend_schema
from rest_framework import generics, permissions

from .models import Role
from .serializers import (
    ContractorDocumentUploadSerializer,
    ContractorRegistrationSerializer,
    CustomerRegistrationSerializer,
)


@extend_schema(tags=["accounts"], summary="Регистрация заказчика")
class RegisterCustomerView(generics.CreateAPIView):
    serializer_class = CustomerRegistrationSerializer
    permission_classes = [permissions.AllowAny]


@extend_schema(tags=["accounts"], summary="Регистрация исполнителя")
class RegisterContractorView(generics.CreateAPIView):
    serializer_class = ContractorRegistrationSerializer
    permission_classes = [permissions.AllowAny]


class IsContractor(permissions.BasePermission):
    def has_permission(self, request, view) -> bool:
        return bool(request.user and request.user.is_authenticated and request.user.role == Role.CONTRACTOR)


@extend_schema(tags=["accounts"], summary="Загрузка сканов лицензии/аттестата исполнителем")
class ContractorDocumentUploadView(generics.UpdateAPIView):
    serializer_class = ContractorDocumentUploadSerializer
    permission_classes = [IsContractor]

    def get_object(self):
        return self.request.user.contractor_profile
