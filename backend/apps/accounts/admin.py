from __future__ import annotations

from django.contrib import admin
from django.utils.html import format_html

from .models import ContractorProfile, User


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ["email", "full_name", "phone", "role", "person_type", "is_active", "date_joined"]
    list_filter = ["role", "person_type", "is_active"]
    search_fields = ["email", "full_name", "iin", "bin", "organization_name"]
    ordering = ["-date_joined"]


@admin.register(ContractorProfile)
class ContractorProfileAdmin(admin.ModelAdmin):
    list_display = [
        "user",
        "verification_status",
        "verification_method",
        "license_expiry",
        "license_scan_link",
        "attestation_scan_link",
    ]
    list_filter = ["verification_status", "verification_method"]
    list_editable = ["verification_status"]
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
