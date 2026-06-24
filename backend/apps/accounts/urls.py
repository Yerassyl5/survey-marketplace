from django.urls import path

from .views import RegisterContractorView, RegisterCustomerView

app_name = "accounts"

urlpatterns = [
    path("register/customer/", RegisterCustomerView.as_view(), name="register-customer"),
    path("register/contractor/", RegisterContractorView.as_view(), name="register-contractor"),
]
