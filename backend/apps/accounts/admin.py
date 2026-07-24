from __future__ import annotations

import contextvars
from urllib.parse import urlencode

from django import forms
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.urls import reverse
from django.utils import timezone
from django.utils.html import format_html

from apps.notifications.services import get_last_logins
from common.events import publish

from .events import ContractorVerificationDecided, EmailVerificationChangedByAdmin
from .forms import UserChangeForm, UserCreationForm
from .models import ContractorProfile, User, VerificationStatus

# Словарь «последний вход» на всю страницу списка — считается один раз в
# UserAdmin.get_queryset(), читается в last_login_display() на каждую
# строку. НЕ атрибут self._last_logins на инстансе UserAdmin — тот
# создаётся один раз и переиспользуется между запросами (Django admin
# ModelAdmin — singleton), а runserver/Gunicorn (architecture.md §9,
# несколько threads/workers) обслуживают запросы конкурентно: два
# оператора, открывшие список одновременно, затирали бы словарь друг
# друга посреди рендера строк. ContextVar изолирован по потоку/задаче
# автоматически — тот же примитив, которым Django/DRF пользуются для
# per-request состояния.
_last_logins_ctx: contextvars.ContextVar[dict] = contextvars.ContextVar(
    "user_admin_last_logins", default={}
)


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
        "role",
        "organization_name_display",
        "is_active",
        "is_email_verified",
        "date_joined",
        "last_login_display",
    ]
    # phone/person_type убраны из списка (решение пользователя): колонок
    # стало много, не влезают; organization_name_display уже показывает,
    # юрлицо это или физлицо (дублирование с person_type); телефон нужен
    # только в карточке. person_type ОСТАЁТСЯ в list_filter — фильтровать
    # по типу лица по-прежнему полезно, туда список колонок не влияет.
    list_filter = ["role", "person_type", "is_active", "is_email_verified"]
    # is_email_verified — тот же паттерн, что verification_status/
    # rejection_reason у ContractorProfileAdmin: статус-флаг, который
    # поддержке нужно быстро переключить прямо из списка (человек
    # застрял — письмо реально не дошло, гейт блокирует и заявку, и
    # отклик), не только со страницы одного пользователя. Список
    # неподтверждённых через list_filter — практическая ценность:
    # это застрявшие, кто не может ни создать заявку, ни откликнуться.
    list_editable = ["is_email_verified"]
    search_fields = ["email", "full_name", "iin", "bin", "organization_name"]
    ordering = ["-date_joined"]
    filter_horizontal = ["groups", "user_permissions"]
    readonly_fields = ["date_joined", "login_history_link"]

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
        (
            "Права доступа",
            {"fields": ("is_active", "is_email_verified", "is_staff", "is_superuser", "groups", "user_permissions")},
        ),
        # last_login убран из отображения (было в этом фильдсете) —
        # UPDATE_LAST_LOGIN=False (settings.py), поле у ЛЮБОГО обычного
        # пользователя всегда пусто, оператор видел бы «сломанное» на
        # вид поле. Реальная история входов — событие UserLoggedIn в
        # AuditLog (accounts/events.py), сюда — ссылка на неё.
        ("Важные даты", {"fields": ("login_history_link", "date_joined")}),
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

    def get_queryset(self, request):
        # Один bulk-запрос на id + один агрегатный на AuditLog — не по
        # одному на пользователя. Считаем на ВСЕХ User, не только на
        # отфильтрованных/попавших на страницу ChangeList (тот queryset
        # собирается позже, после этого метода) — при нынешнем масштабе
        # (десятки-сотни пользователей) разница не имеет значения, а
        # точный расчёт «только для видимой страницы» потребовал бы
        # либо своей ChangeList, либо аннотации Subquery поверх
        # notifications.AuditLog прямо в этом queryset — то и другое
        # либо усложняет, либо нарушает инвариант №12 (см. events.py/
        # docs/progress.md, блок «Сброс пароля»).
        qs = super().get_queryset(request)
        user_ids = list(User.objects.values_list("pk", flat=True))
        _last_logins_ctx.set(get_last_logins(user_ids))
        return qs

    @admin.display(description="Последний вход")
    def last_login_display(self, obj: User) -> str:
        last_login = _last_logins_ctx.get().get(obj.pk)
        if last_login is None:
            return "—"
        # last_login хранится в UTC (get_last_logins читает AuditLog.
        # created_at, USE_TZ=True) — timezone.localtime() переводит в
        # settings.TIME_ZONE (Asia/Almaty) перед strftime. Без этого шага
        # колонка показывала бы сырой UTC, разойдясь на 5 часов с той же
        # записью в журнале AuditLog (там created_at рендерится штатным
        # полем DateTimeField в readonly_fields, который эту конвертацию
        # делает сам) — найдено живой проверкой, не по коду.
        return timezone.localtime(last_login).strftime("%d.%m.%Y %H:%M")

    @admin.display(description="Организация")
    def organization_name_display(self, obj: User) -> str:
        return obj.organization_name or "—"

    @admin.display(description="История входов")
    def login_history_link(self, obj: User) -> str:
        if not obj.pk:
            return "—"
        url = reverse("admin:notifications_auditlog_changelist")
        query = urlencode({"event_type": "accounts.UserLoggedIn", "q": str(obj.pk)})
        return format_html('<a href="{}?{}" target="_blank">Открыть в журнале →</a>', url, query)

    def save_model(self, request, obj, form, change):
        """Публикует EmailVerificationChangedByAdmin ТОЛЬКО при реальном
        изменении is_email_verified — сравнение со значением из БД ДО
        сохранения, не form.changed_data, тем же способом и по той же
        причине, что ContractorProfileAdmin.save_model ниже (поле
        редактируется и полной формой, и list_editable, оба пути должны
        сравниваться одинаково надёжно). Не публикует на создании
        пользователя (change=False) и при сохранении без изменения флага
        (например, правка телефона того же пользователя)."""
        old_verified = None
        if change:
            old_verified = User.objects.filter(pk=obj.pk).values_list(
                "is_email_verified", flat=True
            ).first()
        super().save_model(request, obj, form, change)
        if change and old_verified is not None and old_verified != obj.is_email_verified:
            publish(EmailVerificationChangedByAdmin(
                user_id=obj.id, is_email_verified=obj.is_email_verified,
                changed_by_user_id=request.user.id,
            ))


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
                changed_by_user_id=request.user.id,
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
