from __future__ import annotations

from django import forms
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.utils.html import format_html

from common.events import publish

from .events import ContractorVerificationDecided
from .forms import UserChangeForm, UserCreationForm
from .models import ContractorProfile, User, VerificationStatus


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
        "rejection_reason",
        "verification_method",
        "license_expiry",
        "license_scan_link",
        "attestation_scan_link",
    ]
    list_filter = ["verification_status", "verification_method"]
    # rejection_reason — настоящее поле модели (не @admin.display-метод):
    # list_editable требует этого, computed-колонку (паттерн усечения, как
    # у marketplace.RequestAdmin.contractor_note_column) сюда не поставить —
    # редактируемость важнее компактности (см. задачу 8, обоснование пользователя).
    list_editable = ["verification_status", "rejection_reason"]
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

    def save_model(self, request, obj, form, change):
        """Публикует ContractorVerificationDecided ТОЛЬКО при реальном
        переходе verification_status на VERIFIED/REJECTED — сравнение со
        значением из БД ДО сохранения, не form.changed_data: поле
        редактируется двумя разными путями админки (полная форма страницы
        И list_editable прямо в changelist), оба вызывают этот save_model,
        а свежий запрос к БД работает одинаково надёжно в обоих путях, не
        завязан на то, как Django строит форму для каждого из них.

        Решение принимается ТОЛЬКО модератором вручную в Django Admin —
        другого пути сейчас нет. Сигнал post_save на ContractorProfile
        ловил бы шире, но выстреливал бы и на data-миграциях, и на любом
        тесте, трогающем профиль, пряча логику там, где её никто не ищет.
        Когда появится автосверка по elicense.kz (architecture.md §4.1,
        «Отложено») — она публикует событие явно из своего кода, это
        осознанное место расширения, а не забытая дыра.

        Условие verification_status in (VERIFIED, REJECTED) отсекает
        переход not_submitted -> pending (документы просто поданы, не
        решение). old_status == new_status (например, модератор поправил
        опечатку в rejection_reason уже отклонённой заявки, статус не
        менял) — событие тоже не публикуется, письмо повторно не уходит."""
        old_status = None
        if change:
            old_status = ContractorProfile.objects.filter(pk=obj.pk).values_list(
                "verification_status", flat=True
            ).first()
        super().save_model(request, obj, form, change)
        if (
            change
            and old_status is not None
            and old_status != obj.verification_status
            and obj.verification_status in (VerificationStatus.VERIFIED, VerificationStatus.REJECTED)
        ):
            publish(ContractorVerificationDecided(
                contractor_id=obj.user_id,
                decision=obj.verification_status,
                rejection_reason=(
                    obj.rejection_reason if obj.verification_status == VerificationStatus.REJECTED else ""
                ),
            ))

    def formfield_for_dbfield(self, db_field, request, **kwargs):
        # Ужимаем виджет ТОЛЬКО для rejection_reason (по имени поля, не через
        # formfield_overrides по типу TextField) — на модели есть ещё
        # portfolio_description того же типа, formfield_overrides задел бы
        # и его, если он когда-нибудь попадёт в эту админку. Без ужимания
        # дефолтный <textarea rows=10 cols=40> разносил бы строку таблицы
        # в list_editable.
        if db_field.name == "rejection_reason":
            kwargs["widget"] = forms.Textarea(attrs={"rows": 2, "cols": 40})
        return super().formfield_for_dbfield(db_field, request, **kwargs)

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
