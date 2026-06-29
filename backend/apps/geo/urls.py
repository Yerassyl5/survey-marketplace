from django.urls import path

from .views import SiteGeometryUploadView

app_name = "geo"

urlpatterns = [
    path("sites/<int:site_id>/geometry/", SiteGeometryUploadView.as_view(), name="site-geometry-upload"),
]
