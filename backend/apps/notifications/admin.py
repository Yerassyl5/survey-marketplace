from django.contrib import admin

from .models import AuditLog


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    """Строго read-only — в отличие от ReviewAdmin (reputation/admin.py),
    где удаление разрешено как рычаг модерации спама, здесь запрещено и
    удаление: append-only журнал, из которого можно удалить запись, не
    журнал по сути (искажает разбор споров/инцидентов задним числом)."""
    list_display = ["id", "event_type", "created_at"]
    list_filter = ["event_type"]
    # payload__user_id — поиск по ключу JSONField (Postgres, проверено
    # фактом: AuditLog.objects.filter(payload__user_id__icontains=...)
    # работает). Даёт «история этого пользователя» независимо от типа
    # события (UserLoggedIn/PasswordChanged/... — все кладут user_id под
    # этим именем в payload), не только поиск по event_type.
    search_fields = ["event_type", "payload__user_id"]
    readonly_fields = ["event_type", "payload", "created_at"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
