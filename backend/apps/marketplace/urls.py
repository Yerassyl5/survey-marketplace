from django.urls import path

from .views import (
    AcceptView,
    AwardView,
    BidListCreateView,
    ConsiderBidView,
    MyAwardedListView,
    MyBidListView,
    RequestDetailView,
    RequestListCreateView,
    ReturnView,
    SubmitResultView,
    WithdrawBidView,
)

app_name = "marketplace"

urlpatterns = [
    path("requests/", RequestListCreateView.as_view(), name="request-list-create"),
    path("requests/<int:pk>/", RequestDetailView.as_view(), name="request-detail"),
    path("requests/<int:request_pk>/bids/", BidListCreateView.as_view(), name="bid-list-create"),
    path("bids/<int:pk>/consider/", ConsiderBidView.as_view(), name="bid-consider"),
    path("bids/<int:pk>/withdraw/", WithdrawBidView.as_view(), name="bid-withdraw"),
    path("requests/<int:pk>/award/", AwardView.as_view(), name="request-award"),
    path("requests/<int:pk>/submit-result/", SubmitResultView.as_view(), name="request-submit-result"),
    path("requests/<int:pk>/accept/", AcceptView.as_view(), name="request-accept"),
    path("requests/<int:pk>/return/", ReturnView.as_view(), name="request-return"),
    path("my-bids/", MyBidListView.as_view(), name="my-bids"),
    path("my-awarded/", MyAwardedListView.as_view(), name="my-awarded"),
]
