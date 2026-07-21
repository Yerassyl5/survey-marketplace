from django.urls import path

from .views import ContractorReviewsView, ReviewDetailCreateView, TagListView

app_name = "reputation"

urlpatterns = [
    path("requests/<int:pk>/review/", ReviewDetailCreateView.as_view(), name="request-review"),
    path("tags/", TagListView.as_view(), name="tag-list"),
    path("contractors/<int:pk>/reviews/", ContractorReviewsView.as_view(), name="contractor-reviews"),
]
