from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    ChangePasswordView,
    ContractorDocumentUploadView,
    ContractorPublicView,
    LoginView,
    LogoutView,
    MeView,
    ProfileView,
    RegisterContractorView,
    RegisterCustomerView,
    ResendVerificationView,
    VerifyEmailView,
)

app_name = "accounts"

urlpatterns = [
    path("register/customer/", RegisterCustomerView.as_view(), name="register-customer"),
    path("register/contractor/", RegisterContractorView.as_view(), name="register-contractor"),
    path("contractor/documents/", ContractorDocumentUploadView.as_view(), name="contractor-documents"),
    path("login/", LoginView.as_view(), name="login"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token-refresh"),
    path("me/", MeView.as_view(), name="me"),
    path("profile/", ProfileView.as_view(), name="profile"),
    path("change-password/", ChangePasswordView.as_view(), name="change-password"),
    path("contractors/<int:pk>/", ContractorPublicView.as_view(), name="contractor-public"),
    path("verify-email/", VerifyEmailView.as_view(), name="verify-email"),
    path("resend-verification/", ResendVerificationView.as_view(), name="resend-verification"),
]
