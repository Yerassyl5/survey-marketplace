from django.contrib import admin

from .models import Bid, Request


@admin.register(Request)
class RequestAdmin(admin.ModelAdmin):
    list_display = ("id", "work_type", "city", "status", "customer", "assigned_contractor", "created_at")
    list_filter = ("status", "work_type")
    search_fields = ("city", "description", "customer__email")
    readonly_fields = ("created_at", "updated_at")


@admin.register(Bid)
class BidAdmin(admin.ModelAdmin):
    list_display = ("id", "request", "contractor", "status", "created_at")
    list_filter = ("status",)
    search_fields = ("contractor__email",)
    readonly_fields = ("created_at",)
