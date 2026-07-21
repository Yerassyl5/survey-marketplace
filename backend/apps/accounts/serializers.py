from __future__ import annotations

from django.contrib.auth.models import update_last_login
from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.settings import api_settings as simplejwt_settings

from common.events import publish

from .events import UserRegistered
from .models import ContractorProfile, PersonType, Role, User, VerificationStatus
from .validators import validate_phone_format


class BaseRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    phone = serializers.CharField(validators=[validate_phone_format])

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "password",
            "person_type",
            "full_name",
            "phone",
            "iin",
            "bin",
            "organization_name",
            "position",
        ]
        read_only_fields = ["id"]

    def validate(self, attrs):
        person_type = attrs.get("person_type")
        iin = attrs.get("iin", "")
        bin_ = attrs.get("bin", "")
        organization_name = attrs.get("organization_name", "")
        position = attrs.get("position", "")
        if person_type == PersonType.INDIVIDUAL and not iin:
            raise serializers.ValidationError({"iin": "Обязателен для физического лица."})
        if person_type == PersonType.LEGAL and not bin_:
            raise serializers.ValidationError({"bin": "Обязателен для юридического лица."})
        if person_type == PersonType.INDIVIDUAL and bin_:
            raise serializers.ValidationError({"bin": "Не заполняется для физического лица."})
        if person_type == PersonType.LEGAL and iin:
            raise serializers.ValidationError({"iin": "Не заполняется для юридического лица."})
        if person_type == PersonType.LEGAL and not organization_name:
            raise serializers.ValidationError({"organization_name": "Обязательно для юридического лица."})
        if person_type == PersonType.LEGAL and not position:
            raise serializers.ValidationError({"position": "Обязательна для юридического лица."})
        if person_type == PersonType.INDIVIDUAL and organization_name:
            raise serializers.ValidationError({"organization_name": "Не заполняется для физического лица."})
        if person_type == PersonType.INDIVIDUAL and position:
            raise serializers.ValidationError({"position": "Не заполняется для физического лица."})
        return attrs


class CustomerRegistrationSerializer(BaseRegistrationSerializer):
    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User.objects.create_user(role=Role.CUSTOMER, password=password, **validated_data)
        publish(UserRegistered(user_id=user.id, role=user.role))
        return user


class ContractorRegistrationSerializer(BaseRegistrationSerializer):
    license_number = serializers.CharField(required=False, allow_blank=True)
    attestation_number = serializers.CharField(required=False, allow_blank=True)
    license_expiry = serializers.DateField(required=False, allow_null=True)

    class Meta(BaseRegistrationSerializer.Meta):
        fields = BaseRegistrationSerializer.Meta.fields + [
            "license_number",
            "attestation_number",
            "license_expiry",
        ]

    def to_representation(self, instance):
        # license_number/attestation_number/license_expiry физически хранятся
        # в ContractorProfile, а не в User — подставляем их в ответ оттуда.
        data = super().to_representation(instance)
        profile = instance.contractor_profile
        data["license_number"] = profile.license_number
        data["attestation_number"] = profile.attestation_number
        data["license_expiry"] = profile.license_expiry
        data["verification_status"] = profile.verification_status
        return data

    def create(self, validated_data):
        password = validated_data.pop("password")
        license_number = validated_data.pop("license_number", "")
        attestation_number = validated_data.pop("attestation_number", "")
        license_expiry = validated_data.pop("license_expiry", None)

        user = User.objects.create_user(role=Role.CONTRACTOR, password=password, **validated_data)
        ContractorProfile.objects.create(
            user=user,
            license_number=license_number,
            attestation_number=attestation_number,
            license_expiry=license_expiry,
        )
        publish(UserRegistered(user_id=user.id, role=user.role))
        return user


class ContractorDocumentUploadSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContractorProfile
        fields = ["license_scan", "attestation_scan"]

    def update(self, instance, validated_data):
        # Любая пересдача документов обнуляет решение модератора — ВКЛЮЧАЯ
        # verified→pending: иначе верифицированный исполнитель мог бы молча
        # подменить скан лицензии на другой, оставшись «верифицирован» перед
        # заказчиком на непроверенных документах.
        validated_data["verification_status"] = VerificationStatus.PENDING
        validated_data["rejection_reason"] = ""
        return super().update(instance, validated_data)


class LoginSerializer(TokenObtainPairSerializer):
    # USERNAME_FIELD на User — email, поэтому базовый TokenObtainPairSerializer
    # уже принимает email+password; добавляем user_id/role в ответ, чтобы
    # фронту не нужен был отдельный вызов /me/ сразу после логина.
    #
    # validate() переопределён полностью (не вызывает super().validate()), чтобы
    # проверить пароль РОВНО ОДИН РАЗ и по единственному результату отличить
    # «неверный пароль/несуществующий email» (общая ошибка — не раскрываем
    # перебором, существует ли аккаунт) от «пароль верный, но is_active=False»
    # (легитимно сообщить причину). Штатный authenticate()/ModelBackend всегда
    # схлопывает оба случая в None — is_active проверяется уже после пароля,
    # но наружу отдаётся один и тот же результат. Если бы мы сначала звали
    # super().validate(), а при неудаче отдельно перепроверяли check_password(),
    # для существующего email пароль хешировался бы дважды, а для
    # несуществующего — один раз (dummy-хеш), и разница во времени ответа
    # выдавала бы существование аккаунта не текстом, а таймингом.
    default_error_messages = {
        **TokenObtainPairSerializer.default_error_messages,
        "account_suspended": "Ваш аккаунт заблокирован. Обратитесь в поддержку для уточнения деталей.",
    }

    def validate(self, attrs):
        email = attrs.get(self.username_field, "")
        password = attrs.get("password", "")

        user = User.objects.filter(email=email).first()
        if user is not None:
            password_valid = user.check_password(password)
        else:
            # Тайминг-паритет с реальной проверкой пароля (как в Django ModelBackend) —
            # не даём отличить несуществующий email от существующего по времени ответа.
            User().set_password(password)
            password_valid = False

        if not password_valid:
            raise AuthenticationFailed(self.error_messages["no_active_account"], "no_active_account")
        if not user.is_active:
            raise AuthenticationFailed(self.error_messages["account_suspended"], "account_suspended")

        self.user = user
        refresh = self.get_token(self.user)

        data = {"refresh": str(refresh), "access": str(refresh.access_token)}
        if simplejwt_settings.UPDATE_LAST_LOGIN:
            update_last_login(None, self.user)

        data["user_id"] = self.user.id
        data["role"] = self.user.role
        return data


class MeSerializer(serializers.ModelSerializer):
    verification_status = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "role",
            "person_type",
            "full_name",
            "phone",
            "verification_status",
        ]

    def get_verification_status(self, user: User) -> str | None:
        if user.role != Role.CONTRACTOR:
            return None
        return user.contractor_profile.verification_status


class ProfileSerializer(serializers.ModelSerializer):
    """GET/PATCH /accounts/profile/ — в отличие от MeSerializer (лёгкий, для
    каждой загрузки приложения), это полный набор данных для /ru/settings.
    Редактируется ТОЛЬКО phone (обе роли) и portfolio_description (только
    contractor, физически хранится на ContractorProfile, не на User)."""
    phone = serializers.CharField(validators=[validate_phone_format])
    portfolio_description = serializers.CharField(required=False, allow_blank=True)
    verification_status = serializers.SerializerMethodField()
    rejection_reason = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id", "email", "role", "person_type", "full_name", "phone",
            "iin", "bin", "organization_name", "position",
            "portfolio_description", "verification_status", "rejection_reason",
        ]
        read_only_fields = [
            "id", "email", "role", "person_type", "full_name",
            "iin", "bin", "organization_name", "position",
            "verification_status", "rejection_reason",
        ]

    def get_verification_status(self, user: User) -> str | None:
        if user.role != Role.CONTRACTOR:
            return None
        return user.contractor_profile.verification_status

    def get_rejection_reason(self, user: User) -> str | None:
        if user.role != Role.CONTRACTOR:
            return None
        return user.contractor_profile.rejection_reason

    def to_representation(self, instance):
        # portfolio_description физически на ContractorProfile, не на User —
        # обычный CharField без source молча пропал бы из ответа (SkipField,
        # т.к. required=False и getattr(user, "portfolio_description") падает
        # AttributeError). Тот же приём, что уже в ContractorRegistrationSerializer
        # .to_representation() для license_number/attestation_number/license_expiry.
        data = super().to_representation(instance)
        data["portfolio_description"] = (
            instance.contractor_profile.portfolio_description if instance.role == Role.CONTRACTOR else None
        )
        return data

    def validate_portfolio_description(self, value: str) -> str:
        if self.instance.role != Role.CONTRACTOR:
            raise serializers.ValidationError("Доступно только исполнителю.")
        return value

    def update(self, instance, validated_data):
        portfolio_description = validated_data.pop("portfolio_description", None)
        instance = super().update(instance, validated_data)
        if portfolio_description is not None:
            ContractorProfile.objects.filter(user=instance).update(
                portfolio_description=portfolio_description
            )
        return instance


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8)

    def validate_current_password(self, value: str) -> str:
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Неверный текущий пароль.")
        return value
