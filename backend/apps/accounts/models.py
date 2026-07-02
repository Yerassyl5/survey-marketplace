# Модели: User (заказчик/исполнитель), профиль исполнителя
# (license_number, attestation_number, license_expiry, verification_status,
# verification_method) — architecture.md §4.1.
from __future__ import annotations

from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.db import models


class Role(models.TextChoices):
    CUSTOMER = "customer", "Заказчик"
    CONTRACTOR = "contractor", "Исполнитель"


class PersonType(models.TextChoices):
    INDIVIDUAL = "individual", "Физическое лицо"
    LEGAL = "legal", "Юридическое лицо"


class VerificationStatus(models.TextChoices):
    PENDING = "pending", "На проверке"
    VERIFIED = "verified", "Верифицирован"
    REJECTED = "rejected", "Отклонён"


class VerificationMethod(models.TextChoices):
    MANUAL = "manual", "Ручная"
    AUTO = "auto", "Автоматическая"


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create_user(self, email: str, password: str | None, **extra_fields):
        if not email:
            raise ValueError("Email обязателен")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email: str, password: str | None = None, **extra_fields):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(self, email: str, password: str | None = None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("role", Role.CUSTOMER)
        extra_fields.setdefault("person_type", PersonType.INDIVIDUAL)
        extra_fields.setdefault("full_name", "Admin")
        extra_fields.setdefault("phone", "")
        return self._create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    email = models.EmailField(unique=True)
    role = models.CharField(max_length=20, choices=Role.choices)
    person_type = models.CharField(max_length=20, choices=PersonType.choices)
    full_name = models.CharField(max_length=255)
    phone = models.CharField(max_length=32)
    # БИН/ИИН на старте — без автопроверки, просто сохраняются как введены (architecture.md §4.1)
    iin = models.CharField(max_length=12, blank=True)
    bin = models.CharField(max_length=12, blank=True)
    # Для юрлиц: наименование организации и должность регистрирующего лица
    organization_name = models.CharField(max_length=255, blank=True)
    position = models.CharField(max_length=255, blank=True)

    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(auto_now_add=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS: list[str] = []

    def __str__(self) -> str:
        return self.email


class ContractorProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="contractor_profile")
    license_number = models.CharField(max_length=64, blank=True)
    attestation_number = models.CharField(max_length=64, blank=True)
    license_expiry = models.DateField(null=True, blank=True)
    verification_status = models.CharField(
        max_length=20, choices=VerificationStatus.choices, default=VerificationStatus.PENDING
    )
    verification_method = models.CharField(
        max_length=20, choices=VerificationMethod.choices, default=VerificationMethod.MANUAL
    )
    # Сканы разрешительных документов — хранятся в MinIO (STORAGES в settings.py),
    # в БД остаётся только ссылка на файл.
    license_scan = models.FileField(upload_to="contractor_documents/licenses/", blank=True)
    attestation_scan = models.FileField(upload_to="contractor_documents/attestations/", blank=True)
    # Витрина-портфолио исполнителя (минимум на старте)
    portfolio_description = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"Профиль исполнителя: {self.user.email}"
