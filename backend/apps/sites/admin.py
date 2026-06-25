from __future__ import annotations

from django.contrib.gis.admin import GISModelAdmin

from django.contrib import admin

from .models import Site


@admin.register(Site)
class SiteAdmin(GISModelAdmin):
    list_display = ["address", "owner", "cadastral_number", "created_at"]
    list_filter = ["created_at"]
    search_fields = ["address", "cadastral_number", "owner__email"]
