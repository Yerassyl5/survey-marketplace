from django.urls import path

from .views import ReviewDetailCreateView

app_name = "reputation"

urlpatterns = [
    path("requests/<int:pk>/review/", ReviewDetailCreateView.as_view(), name="request-review"),
]
