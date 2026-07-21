from __future__ import annotations

from drf_spectacular.utils import extend_schema
from rest_framework import generics, permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import Role, User
from .serializers import (
    ChangePasswordSerializer,
    ContractorDocumentUploadSerializer,
    ContractorPublicSerializer,
    ContractorRegistrationSerializer,
    CustomerRegistrationSerializer,
    LoginSerializer,
    MeSerializer,
    ProfileSerializer,
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


@extend_schema(tags=["accounts"], summary="Просмотр/редактирование своего профиля")
class ProfileView(generics.RetrieveUpdateAPIView):
    serializer_class = ProfileSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        # select_related — ProfileSerializer обращается к contractor_profile
        # дважды (verification_status/rejection_reason), без него это была бы
        # лишняя query на каждое поле для роли contractor.
        return User.objects.select_related("contractor_profile").get(pk=self.request.user.pk)


@extend_schema(tags=["accounts"], summary="Смена пароля — блеклистит все refresh-токены пользователя")
class ChangePasswordView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data["new_password"])
        request.user.save(update_fields=["password"])
        for token in OutstandingToken.objects.filter(user=request.user):
            BlacklistedToken.objects.get_or_create(token=token)
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(tags=["accounts"], summary="Публичная карточка исполнителя")
class ContractorPublicView(generics.RetrieveAPIView):
    """pk — любой User.id. 404 одинаково для несуществующего id и для id
    заказчика (queryset уже отфильтрован по role=CONTRACTOR) — сторонний
    наблюдатель не должен различать «нет такого» от «есть, но не исполнитель».

    Правило «это исполнитель» ПРОДУБЛИРОВАНО в apps.reputation.views.
    ContractorReviewsView (там — явный .exists()-чек, здесь — фильтр
    queryset) — при изменении условия менять синхронно в обоих местах."""
    serializer_class = ContractorPublicSerializer
    permission_classes = [permissions.IsAuthenticated]
    queryset = User.objects.filter(role=Role.CONTRACTOR).select_related("contractor_profile")
