from __future__ import annotations

from drf_spectacular.utils import extend_schema
from rest_framework import generics, permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from apps.notifications.services import send_password_reset_email, send_verification_email
from common.events import publish

from .events import EmailVerified, PasswordChanged, PasswordResetCompleted, PasswordResetRequested
from .models import Role, User
from .serializers import (
    ChangePasswordSerializer,
    ConfirmPasswordResetSerializer,
    ContractorDocumentUploadSerializer,
    ContractorPublicSerializer,
    ContractorRegistrationSerializer,
    CustomerRegistrationSerializer,
    LoginSerializer,
    MeSerializer,
    ProfileSerializer,
    RequestPasswordResetSerializer,
)
from .services import (
    EmailVerificationTokenExpired,
    EmailVerificationTokenInvalid,
    PasswordResetTokenAlreadyUsed,
    PasswordResetTokenExpired,
    PasswordResetTokenInvalid,
    blacklist_all_refresh_tokens,
    generate_email_verification_token,
    generate_password_reset_token,
    verify_email_verification_token,
    verify_password_reset_token,
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
        blacklist_all_refresh_tokens(request.user)
        publish(PasswordChanged(user_id=request.user.id))
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
        # Проверяем ДО .update() — событие публикуется ТОЛЬКО на реальном
        # переходе False->True, повторное идемпотентное подтверждение уже
        # подтверждённой почты не пишет вторую запись в журнал (блок
        # «Сброс пароля», этап 4 — различение self-verify/admin-override).
        was_verified = User.objects.filter(pk=user_id, is_email_verified=True).exists()
        # queryset .update() — по правилу проекта «переходы статуса не через
        # instance.save()» (marketplace/architecture.md §4.3), единообразия
        # ради, хотя у User нет auto_now-поля, которое пострадало бы от .save().
        User.objects.filter(pk=user_id).update(is_email_verified=True)
        if not was_verified:
            publish(EmailVerified(user_id=user_id))
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


@extend_schema(tags=["accounts"], summary="Запрос сброса пароля по email")
class RequestPasswordResetView(APIView):
    """AllowAny — email на входе ещё не доказывает личность, это только
    адрес отправки. Ответ ВСЕГДА один и тот же независимо от того, найден
    ли пользователь по этому email — иначе эндпоинт стал бы каналом
    перебора зарегистрированных адресов (решение пользователя, этап 2).

    Троттлинг — по IP: ScopedRateThrottle сам берёт IP для
    неаутентифицированных запросов (request.user.is_authenticated всегда
    False здесь), не user.pk, как у resend-verification."""
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password-reset-request"

    _GENERIC_DETAIL = "Если такой email зарегистрирован, на него отправлено письмо с инструкциями по сбросу пароля."

    def post(self, request, *args, **kwargs):
        serializer = RequestPasswordResetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = User.objects.filter(email=serializer.validated_data["email"]).first()
        # Событие и письмо — ТОЛЬКО в этой ветке: публикация PasswordResetRequested
        # для несуществующего email превратила бы AuditLog в тот же канал
        # перебора адресов, который закрывает единый ответ ниже.
        if user is not None:
            publish(PasswordResetRequested(user_id=user.id))
            token = generate_password_reset_token(user)
            send_password_reset_email(user.email, user.full_name, token)
        return Response({"detail": self._GENERIC_DETAIL})


@extend_schema(tags=["accounts"], summary="Подтверждение сброса пароля по токену из письма")
class ConfirmPasswordResetView(APIView):
    """AllowAny — токен сам доказывает право сменить пароль (двухслойный,
    см. services.py). Три различимых кода ошибки — token_expired/
    token_already_used/invalid_token — фронт (этап 3) покажет три разных
    текста, а не одну общую «ссылка недействительна» (решение
    пользователя: «пароль уже изменён» не пугает так, как «недействительна»
    того, кто просто поздно кликнул по уже неактуальной ссылке)."""
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password-reset-confirm"

    def post(self, request, *args, **kwargs):
        serializer = ConfirmPasswordResetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            user = verify_password_reset_token(serializer.validated_data["token"])
        except PasswordResetTokenExpired:
            return Response(
                {"code": "token_expired", "detail": "Ссылка устарела (действует 1 час). Запросите новую."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except PasswordResetTokenAlreadyUsed:
            return Response(
                {
                    "code": "token_already_used",
                    "detail": "Эта ссылка больше не действует — пароль уже был изменён. "
                    "Если это были не вы, запросите сброс пароля заново.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        except PasswordResetTokenInvalid:
            return Response(
                {"code": "invalid_token", "detail": "Ссылка недействительна."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.set_password(serializer.validated_data["new_password"])
        user.save(update_fields=["password"])
        blacklist_all_refresh_tokens(user)
        publish(PasswordResetCompleted(user_id=user.id))
        return Response({"detail": "Пароль изменён."})
