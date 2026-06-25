from django.urls import path

from .views import SiteDetailView, SiteListCreateView

app_name = "sites"

urlpatterns = [
    path("", SiteListCreateView.as_view(), name="site-list-create"),
    path("<int:pk>/", SiteDetailView.as_view(), name="site-detail"),
]
