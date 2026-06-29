from django.contrib import admin

from .models import Bid, Request, ResultFile


class ResultFileInline(admin.TabularInline):
    model = ResultFile
    extra = 0
    readonly_fields = ("file", "original_name", "uploaded_at")
    can_delete = False  # файлы результата не удаляем через Admin


@admin.register(Request)
class RequestAdmin(admin.ModelAdmin):
    list_display = ("id", "work_type", "city", "site", "status", "customer", "assigned_contractor", "created_at")
    list_filter = ("status", "work_type")
    list_select_related = ["customer", "assigned_contractor", "site"]
    search_fields = ("city", "description", "customer__email")
    readonly_fields = ("created_at", "updated_at")
    date_hierarchy = "created_at"
    inlines = [ResultFileInline]


@admin.register(Bid)
class BidAdmin(admin.ModelAdmin):
    list_display = ("id", "request", "contractor", "status", "created_at")
    list_filter = ("status", "request__work_type")
    list_select_related = ["request", "contractor"]
    search_fields = ("contractor__email", "request__city", "request__description")
    readonly_fields = ("created_at",)
