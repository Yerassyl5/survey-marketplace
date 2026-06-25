from __future__ import annotations

from django.contrib import admin

from .models import ContractorProfile, User


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ["email", "full_name", "role", "person_type", "is_active", "date_joined"]
    list_filter = ["role", "person_type", "is_active"]
    search_fields = ["email", "full_name", "iin", "bin"]
    ordering = ["-date_joined"]


@admin.register(ContractorProfile)
class ContractorProfileAdmin(admin.ModelAdmin):
    list_display = ["user", "verification_status", "verification_method", "license_expiry"]
    list_filter = ["verification_status", "verification_method"]
    search_fields = ["user__email", "user__full_name", "license_number", "attestation_number"]
    readonly_fields = ["user", "created_at", "updated_at"]
    fieldsets = [
        ("Исполнитель", {"fields": ["user"]}),
        (
            "Документы",
            {"fields": ["license_number", "attestation_number", "license_expiry", "license_scan", "attestation_scan"]},
        ),
        ("Верификация", {"fields": ["verification_status", "verification_method"]}),
        ("Служебное", {"fields": ["created_at", "updated_at"]}),
    ]
