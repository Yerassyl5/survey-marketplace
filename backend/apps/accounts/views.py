from __future__ import annotations

from drf_spectacular.utils import extend_schema
from rest_framework import generics, permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from apps.notifications.services import send_verification_email

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
from .services import (
    EmailVerificationTokenExpired,
    EmailVerificationTokenInvalid,
    generate_email_verification_token,
    verify_email_verification_token,
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


@extend_schema(tags=["accounts"], summary="Подтверждение почты по токену из письма")
class VerifyEmailView(APIView):
    """AllowAny — токен сам доказывает личность (подписанный, TTL), клик
    по ссылке из письма не обязан приходить из залогиненной сессии в
    ЭТОМ браузере/устройстве.

    Повторное подтверждение уже подтверждённой почты — НЕ ошибка: действие
    идемпотентно (простановка True поверх уже True ничего не меняет),
    тот же успешный ответ, что и при первом подтверждении (решение
    пользователя, этап 3 блока 1.11)."""
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        token = request.data.get("token")
        if not token:
            raise ValidationError({"token": "Обязателен."})
        try:
            user_id = verify_email_verification_token(token)
        except EmailVerificationTokenExpired:
            return Response(
                {"code": "token_expired", "detail": "Ссылка устарела, запросите новую."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except EmailVerificationTokenInvalid:
            return Response(
                {"code": "invalid_token", "detail": "Ссылка недействительна."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # queryset .update() — по правилу проекта «переходы статуса не через
        # instance.save()» (marketplace/architecture.md §4.3), единообразия
        # ради, хотя у User нет auto_now-поля, которое пострадало бы от .save().
        User.objects.filter(pk=user_id).update(is_email_verified=True)
        return Response({"detail": "Почта подтверждена.", "is_email_verified": True})


@extend_schema(tags=["accounts"], summary="Переотправка письма подтверждения почты")
class ResendVerificationView(APIView):
    """Троттлинг — 5/hour (DEFAULT_THROTTLE_RATES в settings.py), ключ —
    request.user.pk (ScopedRateThrottle сам берёт user.pk для
    аутентифицированных запросов, не IP). Обоснование ставки и TTL токена —
    docs/progress.md, этап 3 блока 1.11."""
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "resend-verification"

    def check_throttles(self, request):
        # Уже подтверждённый пользователь, случайно нажавший «отправить
        # повторно», не должен тратить лимит впустую — проверяем ДО того,
        # как trottle посчитает попытку (check_throttles вызывается в
        # dispatch()/initial() РАНЬШЕ post(), обычная проверка внутри тела
        # view была бы уже поздно). Решение пользователя, этап 3 блока 1.11.
        if request.user.is_authenticated and request.user.is_email_verified:
            return
        super().check_throttles(request)

    def post(self, request, *args, **kwargs):
        if request.user.is_email_verified:
            return Response({"detail": "Почта уже подтверждена."})
        token = generate_email_verification_token(request.user.id)
        send_verification_email(request.user.email, request.user.full_name, token)
        return Response({"detail": "Письмо отправлено."})
