from django.urls import path

from .views import ReviewDetailCreateView, TagListView

app_name = "reputation"

urlpatterns = [
    path("requests/<int:pk>/review/", ReviewDetailCreateView.as_view(), name="request-review"),
    path("tags/", TagListView.as_view(), name="tag-list"),
]
