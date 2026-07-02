from django.contrib import admin

from .models import City, District, Region


@admin.register(Region)
class RegionAdmin(admin.ModelAdmin):
    list_display = ("id", "name")
    search_fields = ("name",)


@admin.register(District)
class DistrictAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "region")
    list_filter = ("region",)
    list_select_related = ["region"]
    search_fields = ("name", "region__name")


@admin.register(City)
class CityAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "region")
    list_filter = ("region",)
    list_select_related = ["region"]
    search_fields = ("name",)
