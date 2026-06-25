from __future__ import annotations

from drf_spectacular.utils import extend_schema
from rest_framework import generics, permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import Role
from .serializers import (
    ContractorDocumentUploadSerializer,
    ContractorRegistrationSerializer,
    CustomerRegistrationSerializer,
    LoginSerializer,
    MeSerializer,
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


@extend_schema(tags=["accounts"], summary="Вход по email+паролю, выдача access/refresh токенов")
class LoginView(TokenObtainPairView):
    serializer_class = LoginSerializer
    permission_classes = [permissions.AllowAny]


@extend_schema(tags=["accounts"], summary="Выход — блеклистинг refresh-токена")
class LogoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        refresh = request.data.get("refresh")
        if not refresh:
            raise ValidationError({"refresh": "Обязателен."})
        try:
            RefreshToken(refresh).blacklist()
        except TokenError as exc:
            raise ValidationError({"refresh": str(exc)})
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(tags=["accounts"], summary="Текущий пользователь по токену")
class MeView(generics.RetrieveAPIView):
    serializer_class = MeSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user
