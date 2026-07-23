"""Верификация исполнителя: пересдача документов сбрасывает решение модератора.
Профиль (этап 2): GET/PATCH /accounts/profile/, смена пароля, валидация телефона.
Профиль (этап 3): публичная карточка исполнителя GET /accounts/contractors/{id}/."""
from __future__ import annotations

from unittest.mock import patch

from django.contrib.gis.geos import Point
from django.core import signing
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connection
from django.test import TestCase, override_settings
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient
from rest_framework_simplejwt.token_blacklist.models import OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken

from apps.geo.models import City
from apps.marketplace.models import LocationType, Request, RequestStatus
from apps.sites.models import Site

from .models import ContractorProfile, Role, User, VerificationStatus
from .services import EMAIL_VERIFICATION_SALT, generate_email_verification_token

# Троттлинг resend-verification (settings.py: DEFAULT_THROTTLE_RATES) считает
# по CACHES["default"] — в проде это Redis (этап 3 блока 1.11), но тесты не
# должны трогать реальный dev-Redis: pk пользователей начинается заново на
# каждый прогон manage.py test (тестовая БД пересоздаётся), а throttle-ключ
# в кэше живёт до часа — новый тест-ран мог бы унаследовать чужой счётчик
# от предыдущего прогона по совпавшему pk. LocMemCache — изолированный
# per-process кэш, только для тестов троттлинга.
_LOCMEM_CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}


def make_contractor(email="contractor@test.kz", verification_status=VerificationStatus.PENDING, rejection_reason=""):
    user = User.objects.create_user(
        email=email, password="pass", role=Role.CONTRACTOR,
        person_type="individual", full_name="Исполнитель Тест", phone="700",
    )
    ContractorProfile.objects.create(
        user=user, verification_status=verification_status, rejection_reason=rejection_reason,
    )
    return user


def make_customer(email="customer@test.kz"):
    return User.objects.create_user(
        email=email, password="pass", role=Role.CUSTOMER,
        person_type="individual", full_name="Заказчик Тест", phone="700",
    )


class ContractorDocumentReuploadTests(TestCase):
    def setUp(self):
        self.client_e = APIClient()

    def _patch_documents(self):
        scan = SimpleUploadedFile("license.pdf", b"fake pdf content", content_type="application/pdf")
        return self.client_e.patch(
            "/api/accounts/contractor/documents/", {"license_scan": scan}, format="multipart",
        )

    def test_reupload_resets_rejected_to_pending(self):
        contractor = make_contractor(
            verification_status=VerificationStatus.REJECTED, rejection_reason="Скан лицензии нечитаем.",
        )
        self.client_e.force_authenticate(contractor)
        r = self._patch_documents()
        self.assertEqual(r.status_code, 200)
        contractor.contractor_profile.refresh_from_db()
        self.assertEqual(contractor.contractor_profile.verification_status, VerificationStatus.PENDING)

    def test_reupload_resets_verified_to_pending(self):
        contractor = make_contractor(verification_status=VerificationStatus.VERIFIED)
        self.client_e.force_authenticate(contractor)
        r = self._patch_documents()
        self.assertEqual(r.status_code, 200)
        contractor.contractor_profile.refresh_from_db()
        self.assertEqual(contractor.contractor_profile.verification_status, VerificationStatus.PENDING)

    def test_reupload_resets_not_submitted_to_pending(self):
        contractor = make_contractor(verification_status=VerificationStatus.NOT_SUBMITTED)
        self.client_e.force_authenticate(contractor)
        r = self._patch_documents()
        self.assertEqual(r.status_code, 200)
        contractor.contractor_profile.refresh_from_db()
        self.assertEqual(contractor.contractor_profile.verification_status, VerificationStatus.PENDING)

    def test_reupload_from_pending_stays_pending(self):
        contractor = make_contractor(verification_status=VerificationStatus.PENDING)
        self.client_e.force_authenticate(contractor)
        r = self._patch_documents()
        self.assertEqual(r.status_code, 200)
        contractor.contractor_profile.refresh_from_db()
        self.assertEqual(contractor.contractor_profile.verification_status, VerificationStatus.PENDING)

    def test_reupload_clears_rejection_reason(self):
        contractor = make_contractor(
            verification_status=VerificationStatus.REJECTED, rejection_reason="Скан лицензии нечитаем.",
        )
        self.client_e.force_authenticate(contractor)
        r = self._patch_documents()
        self.assertEqual(r.status_code, 200)
        contractor.contractor_profile.refresh_from_db()
        self.assertEqual(contractor.contractor_profile.rejection_reason, "")


class ProfileViewTests(TestCase):
    def setUp(self):
        self.client_customer = APIClient()
        self.client_contractor = APIClient()
        self.customer = make_customer()
        self.contractor = make_contractor(
            verification_status=VerificationStatus.REJECTED, rejection_reason="Аттестат просрочен.",
        )
        self.client_customer.force_authenticate(self.customer)
        self.client_contractor.force_authenticate(self.contractor)

    def test_customer_reads_profile_portfolio_and_verification_are_null(self):
        r = self.client_customer.get("/api/accounts/profile/")
        self.assertEqual(r.status_code, 200)
        self.assertIsNone(r.data["portfolio_description"])
        self.assertIsNone(r.data["verification_status"])
        self.assertIsNone(r.data["rejection_reason"])
        self.assertFalse(r.data["has_license_scan"])
        self.assertFalse(r.data["has_attestation_scan"])
        self.assertEqual(r.data["completed_requests_count"], 0)

    def test_profile_includes_date_joined_and_completed_count(self):
        r = self.client_contractor.get("/api/accounts/profile/")
        self.assertEqual(r.status_code, 200)
        self.assertIn("date_joined", r.data)
        self.assertEqual(r.data["completed_requests_count"], 0)

    def test_contractor_without_scans_reports_false(self):
        r = self.client_contractor.get("/api/accounts/profile/")
        self.assertEqual(r.status_code, 200)
        self.assertFalse(r.data["has_license_scan"])
        self.assertFalse(r.data["has_attestation_scan"])

    def test_contractor_with_scan_reports_true(self):
        self.contractor.contractor_profile.license_scan = SimpleUploadedFile(
            "license.pdf", b"fake pdf content", content_type="application/pdf"
        )
        self.contractor.contractor_profile.save()
        r = self.client_contractor.get("/api/accounts/profile/")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.data["has_license_scan"])
        self.assertFalse(r.data["has_attestation_scan"])

    def test_contractor_reads_profile_full_set(self):
        r = self.client_contractor.get("/api/accounts/profile/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["verification_status"], VerificationStatus.REJECTED)
        self.assertEqual(r.data["rejection_reason"], "Аттестат просрочен.")

    def test_patch_phone_updates_for_customer(self):
        r = self.client_customer.patch("/api/accounts/profile/", {"phone": "+7 701 123-45-67"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.phone, "+7 701 123-45-67")

    def test_patch_phone_updates_for_contractor(self):
        r = self.client_contractor.patch("/api/accounts/profile/", {"phone": "+77011234567"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.contractor.refresh_from_db()
        self.assertEqual(self.contractor.phone, "+77011234567")

    def test_patch_portfolio_description_contractor_ok(self):
        r = self.client_contractor.patch(
            "/api/accounts/profile/", {"portfolio_description": "10 лет геодезии в Алматы"}, format="json",
        )
        self.assertEqual(r.status_code, 200)
        self.contractor.contractor_profile.refresh_from_db()
        self.assertEqual(self.contractor.contractor_profile.portfolio_description, "10 лет геодезии в Алматы")

    def test_patch_portfolio_description_customer_rejected(self):
        r = self.client_customer.patch(
            "/api/accounts/profile/", {"portfolio_description": "Текст"}, format="json",
        )
        self.assertEqual(r.status_code, 400)
        self.assertIn("portfolio_description", r.data)

    def test_patch_readonly_fields_silently_ignored(self):
        r = self.client_customer.patch(
            "/api/accounts/profile/", {"email": "hacked@test.kz", "iin": "999999999999"}, format="json",
        )
        self.assertEqual(r.status_code, 200)
        self.customer.refresh_from_db()
        self.assertNotEqual(self.customer.email, "hacked@test.kz")

    def test_patch_phone_invalid_format_rejected(self):
        r = self.client_customer.patch("/api/accounts/profile/", {"phone": "звоните мне"}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("phone", r.data)

    def test_patch_phone_soft_formats_accepted(self):
        r = self.client_customer.patch("/api/accounts/profile/", {"phone": "+7 (701) 123-45-67"}, format="json")
        self.assertEqual(r.status_code, 200)

    def test_profile_requires_auth(self):
        r = APIClient().get("/api/accounts/profile/")
        self.assertEqual(r.status_code, 401)


class ChangePasswordTests(TestCase):
    def setUp(self):
        self.client_e = APIClient()
        self.user = make_customer()
        self.client_e.force_authenticate(self.user)

    def test_change_password_success_and_can_login_with_new_password(self):
        r = self.client_e.post(
            "/api/accounts/change-password/",
            {"current_password": "pass", "new_password": "newpass123"},
            format="json",
        )
        self.assertEqual(r.status_code, 204)
        login = APIClient().post(
            "/api/accounts/login/", {"email": self.user.email, "password": "newpass123"}, format="json",
        )
        self.assertEqual(login.status_code, 200)

    def test_change_password_wrong_current_rejected(self):
        r = self.client_e.post(
            "/api/accounts/change-password/",
            {"current_password": "wrong", "new_password": "newpass123"},
            format="json",
        )
        self.assertEqual(r.status_code, 400)
        self.assertIn("current_password", r.data)

    def test_change_password_too_short_rejected(self):
        r = self.client_e.post(
            "/api/accounts/change-password/",
            {"current_password": "pass", "new_password": "short"},
            format="json",
        )
        self.assertEqual(r.status_code, 400)
        self.assertIn("new_password", r.data)

    def test_change_password_blacklists_old_refresh_token(self):
        old_refresh = RefreshToken.for_user(self.user)
        # OutstandingToken создаётся симметрично тому, как это происходит при
        # реальном логине (LoginSerializer вызывает get_token() -> for_user()).
        self.assertTrue(OutstandingToken.objects.filter(user=self.user).exists())

        r = self.client_e.post(
            "/api/accounts/change-password/",
            {"current_password": "pass", "new_password": "newpass123"},
            format="json",
        )
        self.assertEqual(r.status_code, 204)

        refresh_attempt = APIClient().post(
            "/api/accounts/token/refresh/", {"refresh": str(old_refresh)}, format="json",
        )
        self.assertEqual(refresh_attempt.status_code, 401)


class RegistrationPhoneValidationTests(TestCase):
    def test_register_customer_rejects_invalid_phone(self):
        r = APIClient().post("/api/accounts/register/customer/", {
            "email": "newcust@test.kz", "password": "password123",
            "person_type": "individual", "full_name": "Тест Тестов",
            "phone": "звоните мне", "iin": "123456789012",
        }, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("phone", r.data)

    def test_register_contractor_rejects_invalid_phone(self):
        r = APIClient().post("/api/accounts/register/contractor/", {
            "email": "newcontr@test.kz", "password": "password123",
            "person_type": "individual", "full_name": "Тест Тестов",
            "phone": "abc", "iin": "123456789012",
        }, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("phone", r.data)

    def test_register_accepts_soft_formatted_phone(self):
        r = APIClient().post("/api/accounts/register/customer/", {
            "email": "newcust2@test.kz", "password": "password123",
            "person_type": "individual", "full_name": "Тест Тестов",
            "phone": "+7 (701) 123-45-67", "iin": "123456789012",
        }, format="json")
        self.assertEqual(r.status_code, 201)


class ContractorRegistrationVerificationDefaultTests(TestCase):
    def test_register_contractor_defaults_to_not_submitted(self):
        """Новый дефолт модели (задача 8): исполнитель регистрируется без
        сканов — not_submitted, не pending (тот теперь означает «документы
        поданы, ждут решения»)."""
        r = APIClient().post("/api/accounts/register/contractor/", {
            "email": "freshcontr@test.kz", "password": "password123",
            "person_type": "individual", "full_name": "Тест Тестов",
            "phone": "+77010000099", "iin": "123456789012",
        }, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.data["verification_status"], VerificationStatus.NOT_SUBMITTED)


class ContractorPublicViewTests(TestCase):
    def setUp(self):
        self.client_e = APIClient()
        self.contractor = make_contractor(
            verification_status=VerificationStatus.REJECTED, rejection_reason="Аттестат просрочен.",
        )
        self.contractor.contractor_profile.portfolio_description = "10 лет геодезии в Алматы"
        self.contractor.contractor_profile.save()
        self.customer = make_customer()
        self.client_e.force_authenticate(self.customer)

    def test_returns_expected_fields(self):
        r = self.client_e.get(f"/api/accounts/contractors/{self.contractor.id}/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["full_name"], "Исполнитель Тест")
        self.assertEqual(r.data["verification_status"], VerificationStatus.REJECTED)
        self.assertEqual(r.data["portfolio_description"], "10 лет геодезии в Алматы")
        # rejection_reason приватна — этой карточки не касается вообще, ключа нет.
        self.assertNotIn("rejection_reason", r.data)
        self.assertIn("date_joined", r.data)
        self.assertEqual(r.data["completed_requests_count"], 0)

    def test_completed_requests_count_counts_only_accepted(self):
        customer = make_customer(email="counts-customer@test.kz")
        site = Site.objects.create(owner=customer, geometry=Point(76.9, 43.2))
        Request.objects.create(
            site=site, customer=customer, work_type="geodesy", description="x",
            location_type=LocationType.CITY, status=RequestStatus.ACCEPTED,
            assigned_contractor=self.contractor,
        )
        Request.objects.create(
            site=site, customer=customer, work_type="geodesy", description="x",
            location_type=LocationType.CITY, status=RequestStatus.AWARDED,
            assigned_contractor=self.contractor,
        )
        r = self.client_e.get(f"/api/accounts/contractors/{self.contractor.id}/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["completed_requests_count"], 1)

    def test_completed_requests_count_is_single_query(self):
        """Счётчик — один агрегатный запрос (get_completed_counts на список
        из одного id), не N+1: карточка исполнителя всегда об одном
        человеке, но фиксируем фактом, не предположением."""
        with CaptureQueriesContext(connection) as ctx:
            r = self.client_e.get(f"/api/accounts/contractors/{self.contractor.id}/")
        self.assertEqual(r.status_code, 200)
        completed_count_queries = [q for q in ctx.captured_queries if "marketplace_request" in q["sql"]]
        self.assertEqual(
            len(completed_count_queries), 1,
            f"Ожидался ровно 1 запрос к marketplace_request, получено {len(completed_count_queries)}.",
        )

    def test_customer_id_returns_404(self):
        r = self.client_e.get(f"/api/accounts/contractors/{self.customer.id}/")
        self.assertEqual(r.status_code, 404)

    def test_nonexistent_id_returns_404(self):
        r = self.client_e.get("/api/accounts/contractors/999999/")
        self.assertEqual(r.status_code, 404)

    def test_requires_auth(self):
        r = APIClient().get(f"/api/accounts/contractors/{self.contractor.id}/")
        self.assertEqual(r.status_code, 401)

    def test_contractor_without_profile_does_not_crash(self):
        """ContractorProfile создаётся вместе с User в ContractorRegistrationSerializer,
        но не в одной транзакции — на случай рассинхрона сериализатор должен
        вернуть None/"", а не упасть 500 на голом user.contractor_profile."""
        orphan = User.objects.create_user(
            email="orphan@test.kz", password="pass", role=Role.CONTRACTOR,
            person_type="individual", full_name="Без профиля", phone="700",
        )
        r = self.client_e.get(f"/api/accounts/contractors/{orphan.id}/")
        self.assertEqual(r.status_code, 200)
        self.assertIsNone(r.data["verification_status"])
        self.assertEqual(r.data["portfolio_description"], "")


def make_unverified_customer(email="unverified-customer@test.kz"):
    return User.objects.create_user(
        email=email, password="ProgeoTest2026!", role=Role.CUSTOMER,
        person_type="individual", full_name="Неподтверждённый Заказчик", phone="700",
        is_email_verified=False,
    )


def make_unverified_contractor(email="unverified-contractor@test.kz"):
    return User.objects.create_user(
        email=email, password="ProgeoTest2026!", role=Role.CONTRACTOR,
        person_type="individual", full_name="Неподтверждённый Исполнитель", phone="701",
        is_email_verified=False,
    )


class EmailVerificationGateTests(TestCase):
    """Этап 3 блока 1.11 — инвариант №10, мягкая блокировка."""

    def setUp(self):
        self.city, _ = City.objects.get_or_create(name="Алматы", region=None)

    def _request_payload(self, site):
        return {
            "site": site.id, "work_type": "geodesy", "description": "test",
            "location_type": LocationType.CITY, "city": self.city.id,
        }

    def test_unverified_customer_cannot_create_request(self):
        customer = make_unverified_customer()
        site = Site.objects.create(owner=customer, geometry=Point(76.9, 43.2))
        client = APIClient()
        client.force_authenticate(customer)
        r = client.post("/api/marketplace/requests/", self._request_payload(site), format="json")
        self.assertEqual(r.status_code, 403)
        self.assertEqual(r.data["code"], "email_not_verified")

    def test_unverified_contractor_cannot_bid(self):
        customer = make_unverified_customer("verified-owner@test.kz")
        User.objects.filter(pk=customer.pk).update(is_email_verified=True)
        site = Site.objects.create(owner=customer, geometry=Point(76.9, 43.2))
        req = Request.objects.create(
            site=site, customer=customer, work_type="geodesy", description="x",
            location_type=LocationType.CITY, city=self.city,
        )
        contractor = make_unverified_contractor()
        client = APIClient()
        client.force_authenticate(contractor)
        r = client.post(
            f"/api/marketplace/requests/{req.id}/bids/",
            {"price": 1000, "deadline_days": 5}, format="json",
        )
        self.assertEqual(r.status_code, 403)
        self.assertEqual(r.data["code"], "email_not_verified")

    def test_after_verification_customer_can_create_request(self):
        customer = make_unverified_customer("verify-then-create@test.kz")
        token = generate_email_verification_token(customer.id)
        r = APIClient().post("/api/accounts/verify-email/", {"token": token}, format="json")
        self.assertEqual(r.status_code, 200)
        customer.refresh_from_db()
        self.assertTrue(customer.is_email_verified)

        site = Site.objects.create(owner=customer, geometry=Point(76.9, 43.2))
        client = APIClient()
        client.force_authenticate(customer)
        r = client.post("/api/marketplace/requests/", self._request_payload(site), format="json")
        self.assertEqual(r.status_code, 201)

    def test_after_verification_contractor_can_bid(self):
        customer = make_unverified_customer("owner2@test.kz")
        User.objects.filter(pk=customer.pk).update(is_email_verified=True)
        site = Site.objects.create(owner=customer, geometry=Point(76.9, 43.2))
        req = Request.objects.create(
            site=site, customer=customer, work_type="geodesy", description="x",
            location_type=LocationType.CITY, city=self.city,
        )
        contractor = make_unverified_contractor("verify-then-bid@test.kz")
        token = generate_email_verification_token(contractor.id)
        verify_r = APIClient().post("/api/accounts/verify-email/", {"token": token}, format="json")
        self.assertEqual(verify_r.status_code, 200)
        # force_authenticate привязывает КОНКРЕТНЫЙ Python-объект — verify-email
        # изменил БД, но не этот in-memory instance (в отличие от реальной
        # JWTAuthentication, которая читает user заново на каждый запрос).
        contractor.refresh_from_db()

        client = APIClient()
        client.force_authenticate(contractor)
        r = client.post(
            f"/api/marketplace/requests/{req.id}/bids/",
            {"price": 1000, "deadline_days": 5}, format="json",
        )
        self.assertEqual(r.status_code, 201)

    def test_grandfathered_user_creates_request_without_verifying(self):
        """Моделирует «существующего на момент внедрения» пользователя —
        is_email_verified=True без единого обращения к verify-email."""
        customer = User.objects.create_user(
            email="grandfathered@test.kz", password="pass", role=Role.CUSTOMER,
            person_type="individual", full_name="Старый Пользователь", phone="700",
            is_email_verified=True,
        )
        site = Site.objects.create(owner=customer, geometry=Point(76.9, 43.2))
        client = APIClient()
        client.force_authenticate(customer)
        r = client.post("/api/marketplace/requests/", self._request_payload(site), format="json")
        self.assertEqual(r.status_code, 201)

    def test_expired_token_rejected(self):
        customer = make_unverified_customer("expired-token@test.kz")
        token = generate_email_verification_token(customer.id)
        with patch("apps.accounts.services.EMAIL_VERIFICATION_TTL", -1):
            r = APIClient().post("/api/accounts/verify-email/", {"token": token}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.data["code"], "token_expired")
        customer.refresh_from_db()
        self.assertFalse(customer.is_email_verified)

    def test_garbage_token_rejected(self):
        r = APIClient().post("/api/accounts/verify-email/", {"token": "not-a-real-token"}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.data["code"], "invalid_token")

    def test_token_signed_with_foreign_salt_rejected(self):
        """Токен структурно валиден (подписан тем же SECRET_KEY), но под
        другим salt — не должен пройти проверку под salt email-verification
        (домены подписи разведены сознательно, этап 3 блока 1.11)."""
        foreign_token = signing.dumps({"user_id": 999999}, salt="some-other-purpose")
        r = APIClient().post("/api/accounts/verify-email/", {"token": foreign_token}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.data["code"], "invalid_token")

    def test_reverify_already_verified_is_idempotent(self):
        customer = User.objects.create_user(
            email="already-verified@test.kz", password="pass", role=Role.CUSTOMER,
            person_type="individual", full_name="Уже Подтверждён", phone="700",
            is_email_verified=True,
        )
        token = generate_email_verification_token(customer.id)
        r = APIClient().post("/api/accounts/verify-email/", {"token": token}, format="json")
        self.assertEqual(r.status_code, 200)
        customer.refresh_from_db()
        self.assertTrue(customer.is_email_verified)

    def test_missing_token_field_returns_400(self):
        r = APIClient().post("/api/accounts/verify-email/", {}, format="json")
        self.assertEqual(r.status_code, 400)


class UnverifiedUserOtherEndpointsUnaffectedTests(TestCase):
    """Гейт блокирует РОВНО два действия — всё остальное должно работать
    у неподтверждённого пользователя без единого 403 по email_not_verified."""

    def setUp(self):
        self.password = "ProgeoTest2026!"
        self.customer = User.objects.create_user(
            email="unaffected-customer@test.kz", password=self.password, role=Role.CUSTOMER,
            person_type="individual", full_name="Неподтверждённый", phone="700",
            is_email_verified=False,
        )
        self.contractor = make_unverified_contractor("unaffected-contractor@test.kz")

    def test_login_works(self):
        r = APIClient().post(
            "/api/accounts/login/",
            {"email": self.customer.email, "password": self.password}, format="json",
        )
        self.assertEqual(r.status_code, 200)

    def test_me_works_and_reports_is_email_verified(self):
        client = APIClient()
        client.force_authenticate(self.customer)
        r = client.get("/api/accounts/me/")
        self.assertEqual(r.status_code, 200)
        self.assertFalse(r.data["is_email_verified"])

    def test_profile_works(self):
        client = APIClient()
        client.force_authenticate(self.customer)
        r = client.get("/api/accounts/profile/")
        self.assertEqual(r.status_code, 200)

    def test_customer_can_view_own_requests_list(self):
        client = APIClient()
        client.force_authenticate(self.customer)
        r = client.get("/api/marketplace/requests/")
        self.assertEqual(r.status_code, 200)

    def test_customer_can_view_feed_scope(self):
        client = APIClient()
        client.force_authenticate(self.customer)
        r = client.get("/api/marketplace/requests/?scope=feed")
        self.assertEqual(r.status_code, 200)

    def test_contractor_can_view_feed(self):
        client = APIClient()
        client.force_authenticate(self.contractor)
        r = client.get("/api/marketplace/requests/")
        self.assertEqual(r.status_code, 200)

    def test_contractor_can_view_request_detail(self):
        verified_owner = User.objects.create_user(
            email="detail-owner@test.kz", password="pass", role=Role.CUSTOMER,
            person_type="individual", full_name="Владелец", phone="700",
            is_email_verified=True,
        )
        city, _ = City.objects.get_or_create(name="Алматы", region=None)
        site = Site.objects.create(owner=verified_owner, geometry=Point(76.9, 43.2))
        req = Request.objects.create(
            site=site, customer=verified_owner, work_type="geodesy", description="x",
            location_type=LocationType.CITY, city=city,
        )
        client = APIClient()
        client.force_authenticate(self.contractor)
        r = client.get(f"/api/marketplace/requests/{req.id}/")
        self.assertEqual(r.status_code, 200)


@override_settings(CACHES=_LOCMEM_CACHES)
class ResendVerificationThrottleTests(TestCase):
    def setUp(self):
        self.user = make_unverified_customer("resend-throttle@test.kz")
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    @patch("apps.accounts.views.send_verification_email")
    def test_sixth_resend_within_hour_is_throttled(self, mock_send):
        for attempt in range(5):
            r = self.client.post("/api/accounts/resend-verification/")
            self.assertEqual(r.status_code, 200, f"attempt {attempt + 1} should succeed")
        r = self.client.post("/api/accounts/resend-verification/")
        self.assertEqual(r.status_code, 429)
        self.assertEqual(mock_send.call_count, 5)

    @patch("apps.accounts.views.send_verification_email")
    def test_already_verified_resend_does_not_consume_throttle(self, mock_send):
        """Прямое следствие пункта (б): случайный повторный клик подтверждённого
        пользователя не должен тратить лимит впустую — 10 попыток (вдвое
        больше лимита 5/hour) все успешны, письмо не шлётся ни разу."""
        User.objects.filter(pk=self.user.pk).update(is_email_verified=True)
        # Тот же нюанс force_authenticate, что и в EmailVerificationGateTests
        # выше — синхронизируем in-memory объект с БД перед запросами.
        self.user.refresh_from_db()
        for attempt in range(10):
            r = self.client.post("/api/accounts/resend-verification/")
            self.assertEqual(r.status_code, 200, f"attempt {attempt + 1} should succeed")
        mock_send.assert_not_called()
