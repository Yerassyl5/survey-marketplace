"""Верификация исполнителя: пересдача документов сбрасывает решение модератора.
Профиль (этап 2): GET/PATCH /accounts/profile/, смена пароля, валидация телефона.
Профиль (этап 3): публичная карточка исполнителя GET /accounts/contractors/{id}/."""
from __future__ import annotations

from unittest.mock import patch

from django.contrib.gis.geos import Point
from django.core import signing
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connection
from django.test import Client, TestCase, override_settings
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient
from rest_framework_simplejwt.token_blacklist.models import OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken

from apps.geo.models import City
from apps.marketplace.models import LocationType, Request, RequestStatus
from apps.sites.models import Site

from apps.notifications.models import AuditLog
from common.events import publish

from .events import UserLoggedIn
from .models import ContractorProfile, Role, User, VerificationStatus
from .services import (
    EMAIL_VERIFICATION_SALT,
    PASSWORD_RESET_SALT,
    PasswordResetTokenAlreadyUsed,
    PasswordResetTokenExpired,
    PasswordResetTokenInvalid,
    generate_email_verification_token,
    generate_password_reset_token,
    verify_password_reset_token,
)

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

    def test_change_password_publishes_password_changed_event(self):
        r = self.client_e.post(
            "/api/accounts/change-password/",
            {"current_password": "pass", "new_password": "newpass123"},
            format="json",
        )
        self.assertEqual(r.status_code, 204)
        entry = AuditLog.objects.get(event_type="accounts.PasswordChanged")
        self.assertEqual(entry.payload, {"user_id": self.user.id})


class UserLoggedInEventTests(TestCase):
    """История входов — событие UserLoggedIn, не last_login (UPDATE_LAST_LOGIN
    остаётся False, см. settings.py). Только POST /login/, НЕ token/refresh/."""

    def setUp(self):
        self.user = make_customer("login-event@test.kz")

    def test_successful_login_publishes_user_logged_in(self):
        r = APIClient().post(
            "/api/accounts/login/", {"email": self.user.email, "password": "pass"}, format="json",
        )
        self.assertEqual(r.status_code, 200)
        entry = AuditLog.objects.get(event_type="accounts.UserLoggedIn")
        self.assertEqual(entry.payload, {"user_id": self.user.id})

    def test_failed_login_does_not_publish_event(self):
        r = APIClient().post(
            "/api/accounts/login/", {"email": self.user.email, "password": "wrong"}, format="json",
        )
        self.assertEqual(r.status_code, 401)
        self.assertFalse(AuditLog.objects.filter(event_type="accounts.UserLoggedIn").exists())

    def test_token_refresh_does_not_publish_another_login_event(self):
        """token/refresh/ — молчаливое продление сессии (до 4 раз в час на
        открытую вкладку при ACCESS_TOKEN_LIFETIME=15 минут), не действие
        человека — не должно считаться «входом»."""
        login = APIClient().post(
            "/api/accounts/login/", {"email": self.user.email, "password": "pass"}, format="json",
        )
        self.assertEqual(AuditLog.objects.filter(event_type="accounts.UserLoggedIn").count(), 1)

        APIClient().post(
            "/api/accounts/token/refresh/", {"refresh": login.data["refresh"]}, format="json",
        )
        self.assertEqual(AuditLog.objects.filter(event_type="accounts.UserLoggedIn").count(), 1)


class PasswordResetTokenTests(TestCase):
    """Сброс пароля, этап 1 — сервисный слой (генерация/проверка токена),
    без эндпоинтов (те — этап 2). Токен — PasswordResetTokenGenerator,
    обёрнутый в signing.dumps/loads (см. docstring в services.py), не
    signing.dumps в чистом виде, как у email-verification."""

    def setUp(self):
        self.user = make_customer("reset-token@test.kz")

    def test_generate_and_verify_roundtrip(self):
        token = generate_password_reset_token(self.user)
        verified_user = verify_password_reset_token(token)
        self.assertEqual(verified_user.pk, self.user.pk)

    def test_password_change_invalidates_reset_token(self):
        """Ключевое свойство, ради которого выбран PasswordResetTokenGenerator,
        а не signing.dumps: смена пароля сама инвалидирует неиспользованную
        ссылку сброса — signing.dumps этого не даёт вообще (проверено
        фактом, не предположением). PasswordResetTokenAlreadyUsed, не
        PasswordResetTokenInvalid — конверт цел и свеж, просто пароль уже
        сменился (см. docstring исключения в services.py)."""
        token = generate_password_reset_token(self.user)
        self.user.set_password("BrandNewPassword123!")
        self.user.save()
        with self.assertRaises(PasswordResetTokenAlreadyUsed):
            verify_password_reset_token(token)

    def test_expired_envelope_rejected(self):
        token = generate_password_reset_token(self.user)
        with patch("apps.accounts.services.PASSWORD_RESET_TTL", -1):
            with self.assertRaises(PasswordResetTokenExpired):
                verify_password_reset_token(token)

    def test_garbage_token_rejected(self):
        with self.assertRaises(PasswordResetTokenInvalid):
            verify_password_reset_token("not-a-real-token")

    def test_token_signed_with_foreign_salt_rejected(self):
        """Конверт структурно валиден (подписан тем же SECRET_KEY), но под
        другим salt — не должен пройти проверку под salt сброса пароля
        (домены подписи разведены сознательно, как и у email-verification)."""
        foreign_token = signing.dumps(
            {"user_id": self.user.id, "token": "irrelevant"}, salt="some-other-purpose",
        )
        with self.assertRaises(PasswordResetTokenInvalid):
            verify_password_reset_token(foreign_token)

    def test_nonexistent_user_id_rejected(self):
        token = signing.dumps(
            {"user_id": 999999999, "token": "irrelevant"}, salt=PASSWORD_RESET_SALT,
        )
        with self.assertRaises(PasswordResetTokenInvalid):
            verify_password_reset_token(token)

    def test_tampered_inner_token_rejected(self):
        """Внешний конверт цел и свеж (не истёк, подписан нашим SECRET_KEY —
        иначе signing.loads уже отверг бы его как BadSignature), но
        внутренний Django-токен подменён — check_token() должен отвергнуть
        его независимо от валидности внешней подписи. Доказывает, что
        двухслойность реально двухслойна, не декоративна: одной верной
        внешней подписи недостаточно. PasswordResetTokenAlreadyUsed —
        механически неотличимо от «пароль реально сменился» (см.
        test_password_change_invalidates_reset_token выше), это и
        ожидаемо: оба случая означают ровно одно и то же для стороннего
        наблюдателя — «внутренний токен не совпадает с текущим
        состоянием пользователя»."""
        token = signing.dumps(
            {"user_id": self.user.id, "token": "garbage-inner-token"}, salt=PASSWORD_RESET_SALT,
        )
        with self.assertRaises(PasswordResetTokenAlreadyUsed):
            verify_password_reset_token(token)


@override_settings(CACHES=_LOCMEM_CACHES)
class RequestPasswordResetViewTests(TestCase):
    """Этап 2 — эндпоинт запроса сброса. AllowAny, единый ответ.

    Троттлинг здесь по IP (не по user.pk, как resend-verification) — все
    вызовы Django test client используют один и тот же фиктивный IP,
    значит счётчик ОБЩИЙ для всех тестов в одном прогоне. cache.clear()
    в setUp обязателен, иначе тесты этого и соседних классов
    (PasswordResetRequestThrottleTests) взаимно засоряют друг друга
    случайными 429 (найдено фактом при первом прогоне — 2 упавших теста)."""

    def setUp(self):
        cache.clear()
        self.user = make_customer("reset-request@test.kz")

    @patch("apps.accounts.views.send_password_reset_email")
    def test_existing_email_returns_200_and_queues_email(self, mock_send):
        r = APIClient().post(
            "/api/accounts/request-password-reset/", {"email": self.user.email}, format="json",
        )
        self.assertEqual(r.status_code, 200)
        mock_send.assert_called_once()
        args, _ = mock_send.call_args
        self.assertEqual(args[0], self.user.email)

    @patch("apps.accounts.views.send_password_reset_email")
    def test_nonexistent_email_returns_identical_response_without_sending(self, mock_send):
        """Единообразие — ключевое свойство эндпоинта: перебором ответа
        нельзя отличить существующий email от несуществующего."""
        existing = APIClient().post(
            "/api/accounts/request-password-reset/", {"email": self.user.email}, format="json",
        )
        nonexistent = APIClient().post(
            "/api/accounts/request-password-reset/", {"email": "nobody@test.kz"}, format="json",
        )
        self.assertEqual(existing.status_code, nonexistent.status_code)
        self.assertEqual(existing.data, nonexistent.data)
        mock_send.assert_called_once()  # только для существующего email

    @patch("apps.accounts.views.send_password_reset_email")
    def test_nonexistent_email_does_not_grow_audit_log(self, mock_send):
        """Иначе журнал стал бы тем самым каналом перебора адресов,
        который закрывает единый ответ выше."""
        APIClient().post(
            "/api/accounts/request-password-reset/", {"email": "nobody2@test.kz"}, format="json",
        )
        self.assertFalse(
            AuditLog.objects.filter(event_type="accounts.PasswordResetRequested").exists()
        )

    @patch("apps.accounts.views.send_password_reset_email")
    def test_existing_email_publishes_password_reset_requested(self, mock_send):
        APIClient().post(
            "/api/accounts/request-password-reset/", {"email": self.user.email}, format="json",
        )
        entry = AuditLog.objects.get(event_type="accounts.PasswordResetRequested")
        self.assertEqual(entry.payload, {"user_id": self.user.id})

    def test_invalid_email_format_rejected(self):
        r = APIClient().post(
            "/api/accounts/request-password-reset/", {"email": "not-an-email"}, format="json",
        )
        self.assertEqual(r.status_code, 400)


@override_settings(CACHES=_LOCMEM_CACHES)
class ConfirmPasswordResetViewTests(TestCase):
    """Этап 2 — эндпоинт подтверждения сброса, три различимых кода ошибки.

    Троттлинг по IP — тот же нюанс с общим счётчиком, что у
    RequestPasswordResetViewTests выше, cache.clear() обязателен."""

    def setUp(self):
        cache.clear()
        self.user = make_customer("reset-confirm@test.kz")

    def test_success_changes_password_blacklists_tokens_and_publishes_event(self):
        old_refresh = RefreshToken.for_user(self.user)
        token = generate_password_reset_token(self.user)

        r = APIClient().post(
            "/api/accounts/reset-password-confirm/",
            {"token": token, "new_password": "BrandNewPassword123!"},
            format="json",
        )
        self.assertEqual(r.status_code, 200)

        login = APIClient().post(
            "/api/accounts/login/",
            {"email": self.user.email, "password": "BrandNewPassword123!"},
            format="json",
        )
        self.assertEqual(login.status_code, 200)

        refresh_attempt = APIClient().post(
            "/api/accounts/token/refresh/", {"refresh": str(old_refresh)}, format="json",
        )
        self.assertEqual(refresh_attempt.status_code, 401)

        entry = AuditLog.objects.get(event_type="accounts.PasswordResetCompleted")
        self.assertEqual(entry.payload, {"user_id": self.user.id})

    def test_expired_token_returns_token_expired_code(self):
        token = generate_password_reset_token(self.user)
        with patch("apps.accounts.services.PASSWORD_RESET_TTL", -1):
            r = APIClient().post(
                "/api/accounts/reset-password-confirm/",
                {"token": token, "new_password": "AnotherPassword123!"},
                format="json",
            )
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.data["code"], "token_expired")

    def test_already_used_token_returns_token_already_used_code(self):
        """Пароль сменился МЕЖДУ выдачей ссылки и переходом по ней (другим
        путём/повторным кликом) — фронт покажет «пароль уже изменён», не
        «недействительна»."""
        token = generate_password_reset_token(self.user)
        self.user.set_password("SomeOtherPassword123!")
        self.user.save()
        r = APIClient().post(
            "/api/accounts/reset-password-confirm/",
            {"token": token, "new_password": "YetAnotherPassword123!"},
            format="json",
        )
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.data["code"], "token_already_used")

    def test_garbage_token_returns_invalid_token_code(self):
        r = APIClient().post(
            "/api/accounts/reset-password-confirm/",
            {"token": "not-a-real-token", "new_password": "SomePassword123!"},
            format="json",
        )
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.data["code"], "invalid_token")

    def test_too_short_new_password_rejected(self):
        token = generate_password_reset_token(self.user)
        r = APIClient().post(
            "/api/accounts/reset-password-confirm/",
            {"token": token, "new_password": "short"},
            format="json",
        )
        self.assertEqual(r.status_code, 400)


@override_settings(CACHES=_LOCMEM_CACHES)
class PasswordResetRequestThrottleTests(TestCase):
    def setUp(self):
        cache.clear()

    @patch("apps.accounts.views.send_password_reset_email")
    def test_sixth_request_within_hour_is_throttled(self, mock_send):
        make_customer("throttle-target@test.kz")
        for attempt in range(5):
            r = APIClient().post(
                "/api/accounts/request-password-reset/",
                {"email": "throttle-target@test.kz"}, format="json",
            )
            self.assertEqual(r.status_code, 200, f"attempt {attempt + 1} should succeed")
        r = APIClient().post(
            "/api/accounts/request-password-reset/",
            {"email": "throttle-target@test.kz"}, format="json",
        )
        self.assertEqual(r.status_code, 429)


@override_settings(CACHES=_LOCMEM_CACHES)
class PasswordResetConfirmThrottleTests(TestCase):
    def setUp(self):
        cache.clear()

    def test_eleventh_confirm_attempt_within_hour_is_throttled(self):
        """Ставка confirm (10/hour) выше, чем request (5/hour) — не про
        перебор email, а страховка от долбления по попыткам ввода нового
        пароля; garbage-токен достаточен, троттлинг срабатывает до логики
        вьюхи (check_throttles), содержимое запроса не важно."""
        for attempt in range(10):
            r = APIClient().post(
                "/api/accounts/reset-password-confirm/",
                {"token": "garbage", "new_password": "SomePassword123!"},
                format="json",
            )
            self.assertEqual(r.status_code, 400, f"attempt {attempt + 1} should be a normal invalid-token 400")
        r = APIClient().post(
            "/api/accounts/reset-password-confirm/",
            {"token": "garbage", "new_password": "SomePassword123!"},
            format="json",
        )
        self.assertEqual(r.status_code, 429)


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

    def test_first_verification_publishes_email_verified_event(self):
        customer = make_unverified_customer("first-verify-event@test.kz")
        token = generate_email_verification_token(customer.id)
        r = APIClient().post("/api/accounts/verify-email/", {"token": token}, format="json")
        self.assertEqual(r.status_code, 200)
        entry = AuditLog.objects.get(event_type="accounts.EmailVerified")
        self.assertEqual(entry.payload, {"user_id": customer.id})

    def test_reverify_already_verified_does_not_republish_event(self):
        """Идемпотентное повторное подтверждение — событие не пишется
        второй раз (различение self-verify/admin-override теряло бы
        смысл, если бы журнал засорялся повторами одного и того же
        подтверждения)."""
        customer = User.objects.create_user(
            email="reverify-no-duplicate@test.kz", password="pass", role=Role.CUSTOMER,
            person_type="individual", full_name="Уже Подтверждён", phone="700",
            is_email_verified=True,
        )
        token = generate_email_verification_token(customer.id)
        APIClient().post("/api/accounts/verify-email/", {"token": token}, format="json")
        self.assertFalse(
            AuditLog.objects.filter(event_type="accounts.EmailVerified", payload__user_id=customer.id).exists()
        )

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


class UserAdminLastLoginColumnTests(TestCase):
    """Колонка «Последний вход» в UserAdmin (get_queryset + get_last_logins,
    notifications/services.py) — bulk-запрос на всю страницу, не N+1:
    число SQL-запросов на смену не должно расти с числом строк в списке."""

    def setUp(self):
        self.moderator = User.objects.create_user(
            email="changelist-moderator@test.kz", password="pass", role=Role.CUSTOMER,
            person_type="individual", full_name="Модератор Списка", phone="700",
            is_staff=True, is_superuser=True,
        )
        self.client_admin = Client()
        self.client_admin.force_login(self.moderator)

    def _make_users_with_logins(self, n, prefix):
        for i in range(n):
            u = make_customer(f"{prefix}{i}@test.kz")
            publish(UserLoggedIn(user_id=u.id))

    def test_query_count_does_not_grow_with_number_of_users(self):
        self._make_users_with_logins(3, "changelist-few-")
        with CaptureQueriesContext(connection) as ctx_few:
            r = self.client_admin.get("/admin/accounts/user/")
        self.assertEqual(r.status_code, 200)
        few_count = len(ctx_few.captured_queries)

        self._make_users_with_logins(10, "changelist-many-")
        with CaptureQueriesContext(connection) as ctx_many:
            r2 = self.client_admin.get("/admin/accounts/user/")
        self.assertEqual(r2.status_code, 200)
        many_count = len(ctx_many.captured_queries)

        self.assertEqual(
            few_count, many_count,
            f"Число запросов выросло с числом пользователей на странице: "
            f"{few_count} -> {many_count} — похоже на N+1.",
        )
