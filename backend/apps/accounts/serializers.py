from __future__ import annotations

from rest_framework import serializers

from common.events import publish

from .events import UserRegistered
from .models import ContractorProfile, PersonType, Role, User


class BaseRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

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
        ]
        read_only_fields = ["id"]

    def validate(self, attrs):
        person_type = attrs.get("person_type")
        iin = attrs.get("iin", "")
        bin_ = attrs.get("bin", "")
        if person_type == PersonType.INDIVIDUAL and not iin:
            raise serializers.ValidationError({"iin": "Обязателен для физического лица."})
        if person_type == PersonType.LEGAL and not bin_:
            raise serializers.ValidationError({"bin": "Обязателен для юридического лица."})
        if person_type == PersonType.INDIVIDUAL and bin_:
            raise serializers.ValidationError({"bin": "Не заполняется для физического лица."})
        if person_type == PersonType.LEGAL and iin:
            raise serializers.ValidationError({"iin": "Не заполняется для юридического лица."})
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
