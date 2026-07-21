from __future__ import annotations

from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.utils.html import format_html

from .forms import UserChangeForm, UserCreationForm
from .models import ContractorProfile, User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    # Базовый DjangoUserAdmin уже умеет: хешировать пароль через ReadOnlyPasswordHashField,
    # отдельную форму смены пароля (/<id>/password/), AdminPasswordChangeForm — всё это
    # общее для любой модели с USERNAME_FIELD, не завязано на встроенный username.
    form = UserChangeForm
    add_form = UserCreationForm
    model = User

    list_display = [
        "email",
        "full_name",
        "phone",
        "role",
        "person_type",
        "organization_name_display",
        "is_active",
        "date_joined",
    ]
    list_filter = ["role", "person_type", "is_active"]
    search_fields = ["email", "full_name", "iin", "bin", "organization_name"]
    ordering = ["-date_joined"]
    filter_horizontal = ["groups", "user_permissions"]
    readonly_fields = ["date_joined"]

    fieldsets = (
        (None, {"fields": ("email", "password")}),
        (
            "Личные данные",
            {
                "fields": (
                    "full_name",
                    "phone",
                    "role",
                    "person_type",
                    "iin",
                    "bin",
                    "organization_name",
                    "position",
                )
            },
        ),
        ("Права доступа", {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")}),
        ("Важные даты", {"fields": ("last_login", "date_joined")}),
    )
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": ("email", "password1", "password2", "role", "person_type", "full_name", "phone"),
            },
        ),
    )

    @admin.display(description="Организация")
    def organization_name_display(self, obj: User) -> str:
        return obj.organization_name or "—"


@admin.register(ContractorProfile)
class ContractorProfileAdmin(admin.ModelAdmin):
    list_display = [
        "user",
        "organization",
        "verification_status",
        "verification_method",
        "license_expiry",
        "license_scan_link",
        "attestation_scan_link",
    ]
    list_filter = ["verification_status", "verification_method"]
    list_editable = ["verification_status"]
    list_select_related = ["user"]
    search_fields = ["user__email", "user__full_name", "license_number", "attestation_number"]
    readonly_fields = ["user", "created_at", "updated_at"]
    fieldsets = [
        ("Исполнитель", {"fields": ["user"]}),
        (
            "Документы",
            {"fields": ["license_number", "attestation_number", "license_expiry", "license_scan", "attestation_scan"]},
        ),
        ("Верификация", {"fields": ["verification_status", "rejection_reason", "verification_method"]}),
        ("Служебное", {"fields": ["created_at", "updated_at"]}),
    ]

    @admin.display(description="Организация")
    def organization(self, obj: ContractorProfile) -> str:
        return obj.user.organization_name or "—"

    @admin.display(description="Лицензия")
    def license_scan_link(self, obj: ContractorProfile) -> str:
        if obj.license_scan:
            return format_html('<a href="{}" target="_blank">открыть</a>', obj.license_scan.url)
        return "—"

    @admin.display(description="Аттестат")
    def attestation_scan_link(self, obj: ContractorProfile) -> str:
        if obj.attestation_scan:
            return format_html('<a href="{}" target="_blank">открыть</a>', obj.attestation_scan.url)
        return "—"
