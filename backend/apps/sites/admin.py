from __future__ import annotations

from django.contrib import admin
from django.contrib.gis.admin import GISModelAdmin

from .models import Site


@admin.register(Site)
class SiteAdmin(GISModelAdmin):
    list_display = ["__str__", "owner", "created_at"]
    list_filter = ["created_at"]
    list_select_related = ["owner"]
    search_fields = ["owner__email"]
    ordering = ["-created_at"]
