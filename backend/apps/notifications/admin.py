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
    search_fields = ["event_type"]
    readonly_fields = ["event_type", "payload", "created_at"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
