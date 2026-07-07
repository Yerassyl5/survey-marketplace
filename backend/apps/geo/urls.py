from django.urls import path

from .views import GeoLocationsView, GeometryParseView, SiteGeometryUploadView

app_name = "geo"

urlpatterns = [
    path("sites/<int:site_id>/geometry/", SiteGeometryUploadView.as_view(), name="site-geometry-upload"),
    path("geo/locations/", GeoLocationsView.as_view(), name="geo-locations"),
    path("geo/parse-geometry/", GeometryParseView.as_view(), name="geo-parse-geometry"),
]
