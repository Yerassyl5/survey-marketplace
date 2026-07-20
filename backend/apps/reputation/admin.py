from __future__ import annotations

from django.contrib import admin
from django.db.models import Count

from .models import Review, ReviewTag


@admin.register(ReviewTag)
class ReviewTagAdmin(admin.ModelAdmin):
    list_display = ["name", "usage_count"]
    search_fields = ["name"]

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(_usage_count=Count("reviews"))

    @admin.display(description="Используется в отзывах", ordering="_usage_count")
    def usage_count(self, obj):
        return obj._usage_count


@admin.register(Review)
class ReviewAdmin(admin.ModelAdmin):
    """Только просмотр/модерация — отзывы создаются исключительно через
    пользовательский флоу (этап 2), редактирование контента отзыва через
    админку не предусмотрено (искажало бы то, что реально написал заказчик)."""
    list_display = ["id", "request", "contractor", "rating", "created_at"]
    list_filter = ["rating"]
    list_select_related = ["request", "contractor"]
    search_fields = ["contractor__email", "contractor__full_name", "comment"]
    readonly_fields = ["request", "contractor", "rating", "comment", "tags", "created_at"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    # Удаление РАЗРЕШЕНО (в отличие от add/change выше) — это единственный
    # ручной рычаг модерации: убрать спам/оскорбительный отзыв. Явное решение,
    # не забытый метод — has_delete_permission намеренно не переопределён,
    # действует дефолт ModelAdmin (разрешено при наличии права delete_review).
