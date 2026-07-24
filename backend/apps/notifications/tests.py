"""Этапы 1-2 блока 1.11: подписчики доменных событий + журнал."""
from __future__ import annotations

from unittest.mock import patch

from django.contrib.admin.sites import AdminSite
from django.test import RequestFactory, TestCase

from apps.accounts.admin import ContractorProfileAdmin, UserAdmin
from apps.accounts.events import (
    ContractorVerificationDecided,
    PasswordChanged,
    PasswordResetCompleted,
    PasswordResetRequested,
)
from apps.accounts.models import ContractorProfile, Role, User, VerificationStatus
from apps.geo.models import City
from apps.marketplace.events import BidConsidered, BidPlaced, RequestAwarded
from apps.marketplace.models import Bid, LocationType, Request
from apps.sites.models import Site
from common.events import publish

from .models import AuditLog
from .subscribers import register_subscribers


def make_contractor(email="contractor@test.kz"):
    return User.objects.create_user(
        email=email, password="pass", role=Role.CONTRACTOR,
        person_type="individual", full_name="Данияр Исполнителев", phone="701",
    )


def make_customer(email="customer@test.kz"):
    return User.objects.create_user(
        email=email, password="pass", role=Role.CUSTOMER,
        person_type="individual", full_name="Заказчик Тест", phone="700",
    )


def make_request(customer, city_name="Алматы"):
    from django.contrib.gis.geos import Point

    site = Site.objects.create(owner=customer, geometry=Point(76.9, 43.2))
    city, _ = City.objects.get_or_create(name=city_name, region=None)
    return Request.objects.create(
        site=site, customer=customer,
        work_type="geodesy", description="x",
        location_type=LocationType.CITY, city=city,
    )


class BidConsideredEmailTests(TestCase):
    def setUp(self):
        self.contractor = make_contractor()
        self.customer = make_customer()
        self.request_obj = make_request(self.customer)

    @patch("apps.notifications.subscribers.send_email_task")
    def test_publish_bid_considered_queues_email(self, mock_task):
        publish(BidConsidered(
            request_id=self.request_obj.id, bid_id=1, contractor_id=self.contractor.id,
        ))
        mock_task.delay.assert_called_once()
        _, kwargs = mock_task.delay.call_args
        self.assertEqual(kwargs["to_email"], self.contractor.email)
        self.assertEqual(kwargs["template_name"], "bid_considered")
        self.assertEqual(kwargs["context"]["contractor_name"], self.contractor.full_name)

    @patch("apps.notifications.subscribers.send_email_task")
    def test_email_is_queued_not_sent_synchronously(self, mock_task):
        """.delay() вызван, .send()/сама функция задачи — нет: подтверждает
        асинхронную отправку, не синхронный вызов внутри обработчика."""
        publish(BidConsidered(
            request_id=self.request_obj.id, bid_id=1, contractor_id=self.contractor.id,
        ))
        mock_task.delay.assert_called_once()
        mock_task.assert_not_called()

    @patch("apps.notifications.subscribers.send_email_task")
    def test_email_context_has_no_bid_related_fields(self, mock_task):
        """Инвариант №9 — контекст письма содержит СТРОГО три ожидаемых
        ключа, ничего про другие отклики (bids_count и т.п.)."""
        publish(BidConsidered(
            request_id=self.request_obj.id, bid_id=1, contractor_id=self.contractor.id,
        ))
        _, kwargs = mock_task.delay.call_args
        self.assertEqual(
            set(kwargs["context"].keys()),
            {"contractor_name", "work_type_label", "location_label"},
        )


class AuditLogTests(TestCase):
    def setUp(self):
        self.contractor = make_contractor()
        self.customer = make_customer()
        self.request_obj = make_request(self.customer)

    @patch("apps.notifications.subscribers.send_email_task")
    def test_bid_considered_creates_audit_log_entry(self, mock_task):
        publish(BidConsidered(
            request_id=self.request_obj.id, bid_id=1, contractor_id=self.contractor.id,
        ))
        entry = AuditLog.objects.get(event_type="marketplace.BidConsidered")
        self.assertEqual(entry.payload["request_id"], self.request_obj.id)
        self.assertEqual(entry.payload["contractor_id"], self.contractor.id)

    def test_audit_log_covers_any_event_type_not_only_bid_considered(self):
        """Журнал подписан через subscribe_all — проверяем на ДРУГОМ типе
        события, чтобы доказать универсальность, не совпадение с одним типом."""
        from apps.sites.events import SiteCreated

        publish(SiteCreated(site_id=42))
        entry = AuditLog.objects.get(event_type="sites.SiteCreated")
        self.assertEqual(entry.payload["site_id"], 42)

    @patch(
        "apps.notifications.subscribers.send_email_task.delay",
        side_effect=RuntimeError("SMTP недоступен"),
    )
    def test_audit_log_created_even_if_email_handler_fails(self, mock_delay):
        """Прямое следствие изоляции ошибок в publish(): сбой обработчика
        письма не должен помешать журналу получить событие."""
        publish(BidConsidered(
            request_id=self.request_obj.id, bid_id=1, contractor_id=self.contractor.id,
        ))
        self.assertTrue(
            AuditLog.objects.filter(event_type="marketplace.BidConsidered").exists()
        )

    @patch("apps.notifications.subscribers.send_email_task")
    def test_double_registration_does_not_double_send(self, mock_task):
        register_subscribers()
        register_subscribers()
        publish(BidConsidered(
            request_id=self.request_obj.id, bid_id=1, contractor_id=self.contractor.id,
        ))
        mock_task.delay.assert_called_once()
        self.assertEqual(
            AuditLog.objects.filter(event_type="marketplace.BidConsidered").count(), 1
        )


class PasswordResetAndChangeAuditTests(TestCase):
    """Сброс пароля, этап 1 — payload новых событий должен содержать
    СТРОГО user_id, ничего чувствительного (ни токена, ни пароля/хэша) —
    AuditLog пишет dataclasses.asdict(event) целиком в JSONField, читаемый
    в админке. Сами эндпоинты (публикующие PasswordResetRequested/
    Completed) — этап 2; здесь события уже определены и проверяется
    только их прохождение через общий journal-путь (subscribe_all)."""

    def setUp(self):
        self.user = make_customer()

    def test_password_changed_event_has_only_user_id_payload(self):
        publish(PasswordChanged(user_id=self.user.id))
        entry = AuditLog.objects.get(event_type="accounts.PasswordChanged")
        self.assertEqual(entry.payload, {"user_id": self.user.id})

    def test_password_reset_requested_event_has_only_user_id_payload(self):
        publish(PasswordResetRequested(user_id=self.user.id))
        entry = AuditLog.objects.get(event_type="accounts.PasswordResetRequested")
        self.assertEqual(entry.payload, {"user_id": self.user.id})

    def test_password_reset_completed_event_has_only_user_id_payload(self):
        publish(PasswordResetCompleted(user_id=self.user.id))
        entry = AuditLog.objects.get(event_type="accounts.PasswordResetCompleted")
        self.assertEqual(entry.payload, {"user_id": self.user.id})


class EmailVerificationAdminAuditTests(TestCase):
    """Видимость подтверждения почты в UserAdmin — is_email_verified
    редактируемое, ручное изменение оставляет след (EmailVerificationChangedByAdmin),
    тем же паттерном, что ContractorProfileAdmin.save_model ниже."""

    def setUp(self):
        self.user = make_customer("admin-verify-target@test.kz")
        self.moderator = User.objects.create_user(
            email="moderator@test.kz", password="pass", role=Role.CUSTOMER,
            person_type="individual", full_name="Модератор Тестов", phone="700",
            is_staff=True, is_superuser=True,
        )

    def _make_admin(self):
        return UserAdmin(User, AdminSite())

    def _fake_request(self):
        # RequestFactory не проставляет .user (это делает
        # AuthenticationMiddleware в реальном запросе) — save_model теперь
        # читает request.user.id для changed_by_user_id, без явного
        # присвоения тест упал бы AttributeError, не по вине продуктового
        # кода.
        request = RequestFactory().get("/admin/")
        request.user = self.moderator
        return request

    def test_admin_toggles_flag_true_publishes_event(self):
        admin_instance = self._make_admin()
        self.user.is_email_verified = True
        admin_instance.save_model(self._fake_request(), self.user, form=None, change=True)
        entry = AuditLog.objects.get(event_type="accounts.EmailVerificationChangedByAdmin")
        self.assertEqual(
            entry.payload,
            {"user_id": self.user.id, "is_email_verified": True, "changed_by_user_id": self.moderator.id},
        )

    def test_admin_toggles_flag_false_publishes_event(self):
        User.objects.filter(pk=self.user.pk).update(is_email_verified=True)
        self.user.refresh_from_db()
        admin_instance = self._make_admin()
        self.user.is_email_verified = False
        admin_instance.save_model(self._fake_request(), self.user, form=None, change=True)
        entry = AuditLog.objects.get(event_type="accounts.EmailVerificationChangedByAdmin")
        self.assertEqual(
            entry.payload,
            {"user_id": self.user.id, "is_email_verified": False, "changed_by_user_id": self.moderator.id},
        )

    def test_admin_save_without_flag_change_does_not_publish(self):
        """Главный риск: оператор правит телефон того же пользователя,
        не трогая is_email_verified — событие не должно публиковаться."""
        admin_instance = self._make_admin()
        self.user.phone = "701"
        admin_instance.save_model(self._fake_request(), self.user, form=None, change=True)
        self.assertFalse(
            AuditLog.objects.filter(event_type="accounts.EmailVerificationChangedByAdmin").exists()
        )

    def test_admin_does_not_publish_on_create(self):
        """change=False (создание нового пользователя через админку) —
        событие не публикуется независимо от значения флага на новом
        объекте."""
        admin_instance = self._make_admin()
        new_user = User(
            email="new-via-admin@test.kz", role=Role.CUSTOMER, person_type="individual",
            full_name="Новый Через Админку", phone="700", is_email_verified=True,
        )
        new_user.set_password("pass")
        admin_instance.save_model(self._fake_request(), new_user, form=None, change=False)
        self.assertFalse(
            AuditLog.objects.filter(event_type="accounts.EmailVerificationChangedByAdmin").exists()
        )

    def test_repeated_save_with_same_value_does_not_republish(self):
        admin_instance = self._make_admin()
        self.user.is_email_verified = True
        admin_instance.save_model(self._fake_request(), self.user, form=None, change=True)
        self.assertEqual(
            AuditLog.objects.filter(event_type="accounts.EmailVerificationChangedByAdmin").count(), 1,
        )

        self.user.phone = "702"  # правка другого поля, флаг не меняем
        admin_instance.save_model(self._fake_request(), self.user, form=None, change=True)
        self.assertEqual(
            AuditLog.objects.filter(event_type="accounts.EmailVerificationChangedByAdmin").count(), 1,
        )

    def test_changed_by_reflects_the_actual_acting_moderator(self):
        """Доказывает, что в payload попадает именно request.user того
        конкретного запроса, не что-то производное от объекта/фикстуры —
        второй модератор даёт другой changed_by_user_id."""
        other_moderator = User.objects.create_user(
            email="other-moderator@test.kz", password="pass", role=Role.CUSTOMER,
            person_type="individual", full_name="Другой Модератор", phone="700",
            is_staff=True, is_superuser=True,
        )
        request = RequestFactory().get("/admin/")
        request.user = other_moderator

        admin_instance = self._make_admin()
        self.user.is_email_verified = True
        admin_instance.save_model(request, self.user, form=None, change=True)

        entry = AuditLog.objects.get(event_type="accounts.EmailVerificationChangedByAdmin")
        self.assertEqual(entry.payload["changed_by_user_id"], other_moderator.id)
        self.assertNotEqual(entry.payload["changed_by_user_id"], self.moderator.id)

    def test_last_login_column_shows_dash_without_login_and_timestamp_with_it(self):
        """Колонка «Последний вход» (get_queryset + last_login_display) —
        прочерк для того, кто ни разу не логинился, реальная дата для
        того, кто логинился (не пустая ячейка ни в одном из случаев —
        та же причина, по которой last_login убран из «Важные даты»)."""
        from apps.accounts.events import UserLoggedIn

        no_login_user = self.user
        logged_in_user = make_customer("has-real-login@test.kz")
        publish(UserLoggedIn(user_id=logged_in_user.id))

        admin_instance = self._make_admin()
        # get_queryset() заполняет ContextVar на весь список — вызываем
        # его напрямую, тем же способом, что реальный ChangeList.
        admin_instance.get_queryset(self._fake_request())

        self.assertEqual(admin_instance.last_login_display(no_login_user), "—")
        self.assertNotEqual(admin_instance.last_login_display(logged_in_user), "—")


class RequestAwardedEmailTests(TestCase):
    def setUp(self):
        self.contractor = make_contractor()
        self.customer = make_customer()
        self.request_obj = make_request(self.customer)

    @patch("apps.notifications.subscribers.send_email_task")
    def test_publish_request_awarded_queues_email_to_winner(self, mock_task):
        publish(RequestAwarded(request_id=self.request_obj.id, contractor_id=self.contractor.id))
        mock_task.delay.assert_called_once()
        _, kwargs = mock_task.delay.call_args
        self.assertEqual(kwargs["to_email"], self.contractor.email)
        self.assertEqual(kwargs["template_name"], "request_awarded")

    @patch("apps.notifications.subscribers.send_email_task")
    def test_request_awarded_context_has_no_customer_contact(self, mock_task):
        """Правило модуля — почта не знает больше продукта: победитель не
        видит телефон/email заказчика ни в одном сериализаторе, письмо тоже
        не должно их содержать."""
        publish(RequestAwarded(request_id=self.request_obj.id, contractor_id=self.contractor.id))
        _, kwargs = mock_task.delay.call_args
        context_values = " ".join(str(v) for v in kwargs["context"].values())
        self.assertNotIn(self.customer.phone, context_values)
        self.assertNotIn(self.customer.email, context_values)
        self.assertEqual(
            set(kwargs["context"].keys()),
            {"contractor_name", "work_type_label", "location_label", "request_url"},
        )


class BidPlacedFirstResponseEmailTests(TestCase):
    def setUp(self):
        self.customer = make_customer()
        self.request_obj = make_request(self.customer)
        self.contractor1 = make_contractor(email="c1@test.kz")
        self.contractor2 = make_contractor(email="c2@test.kz")

    @patch("apps.notifications.subscribers.send_email_task")
    def test_first_bid_queues_email_to_customer(self, mock_task):
        Bid.objects.create(request=self.request_obj, contractor=self.contractor1)
        publish(BidPlaced(
            request_id=self.request_obj.id, bid_id=1, contractor_id=self.contractor1.id,
        ))
        mock_task.delay.assert_called_once()
        _, kwargs = mock_task.delay.call_args
        self.assertEqual(kwargs["to_email"], self.customer.email)
        self.assertEqual(kwargs["template_name"], "bid_first_response")
        self.assertEqual(kwargs["context"]["contractor_name"], self.contractor1.full_name)

    @patch("apps.notifications.subscribers.send_email_task")
    def test_second_bid_does_not_queue_email(self, mock_task):
        """Письмо только на ПЕРВЫЙ отклик (PRODUCT_SPEC 1.11) — второй
        отклик на ту же заявку не должен слать повторное «первый отклик»."""
        Bid.objects.create(request=self.request_obj, contractor=self.contractor1)
        Bid.objects.create(request=self.request_obj, contractor=self.contractor2)
        publish(BidPlaced(
            request_id=self.request_obj.id, bid_id=2, contractor_id=self.contractor2.id,
        ))
        mock_task.delay.assert_not_called()


class VerificationDecidedEmailTests(TestCase):
    def setUp(self):
        self.contractor = make_contractor()
        self.profile = ContractorProfile.objects.create(
            user=self.contractor, verification_status=VerificationStatus.PENDING,
        )
        self.moderator = User.objects.create_user(
            email="verification-moderator@test.kz", password="pass", role=Role.CUSTOMER,
            person_type="individual", full_name="Модератор Верификации", phone="700",
            is_staff=True, is_superuser=True,
        )

    @patch("apps.notifications.subscribers.send_email_task")
    def test_verified_decision_queues_email(self, mock_task):
        publish(ContractorVerificationDecided(
            contractor_id=self.contractor.id, decision=VerificationStatus.VERIFIED, rejection_reason="",
            changed_by_user_id=self.moderator.id,
        ))
        mock_task.delay.assert_called_once()
        _, kwargs = mock_task.delay.call_args
        self.assertEqual(kwargs["context"]["decision"], VerificationStatus.VERIFIED)

    @patch("apps.notifications.subscribers.send_email_task")
    def test_rejected_decision_includes_reason(self, mock_task):
        publish(ContractorVerificationDecided(
            contractor_id=self.contractor.id, decision=VerificationStatus.REJECTED,
            rejection_reason="Скан лицензии нечитаем", changed_by_user_id=self.moderator.id,
        ))
        _, kwargs = mock_task.delay.call_args
        self.assertEqual(kwargs["context"]["rejection_reason"], "Скан лицензии нечитаем")

    def _make_admin(self):
        return ContractorProfileAdmin(ContractorProfile, AdminSite())

    def _fake_request(self):
        # RequestFactory не проставляет .user — save_model теперь читает
        # request.user.id для changed_by_user_id (см. EmailVerificationAdminAuditTests
        # выше, тот же нюанс).
        request = RequestFactory().get("/admin/")
        request.user = self.moderator
        return request

    @patch("apps.notifications.subscribers.send_email_task")
    def test_admin_save_model_publishes_on_status_change(self, mock_task):
        """publish() из ContractorProfileAdmin.save_model, не прямой вызов —
        доказывает, что событие реально уходит из реального пути сохранения."""
        admin_instance = self._make_admin()
        self.profile.verification_status = VerificationStatus.VERIFIED
        admin_instance.save_model(self._fake_request(), self.profile, form=None, change=True)
        mock_task.delay.assert_called_once()
        entry = AuditLog.objects.get(event_type="accounts.ContractorVerificationDecided")
        self.assertEqual(entry.payload["decision"], VerificationStatus.VERIFIED)
        self.assertEqual(entry.payload["changed_by_user_id"], self.moderator.id)

    @patch("apps.notifications.subscribers.send_email_task")
    def test_admin_save_model_does_not_republish_on_unrelated_change(self, mock_task):
        """Главный риск этапа: модератор сохраняет профиль, не меняя
        verification_status (например, правит license_number) — письмо
        повторно уходить не должно."""
        admin_instance = self._make_admin()
        self.profile.verification_status = VerificationStatus.VERIFIED
        admin_instance.save_model(self._fake_request(), self.profile, form=None, change=True)
        mock_task.reset_mock()

        self.profile.license_number = "LIC-12345"
        admin_instance.save_model(self._fake_request(), self.profile, form=None, change=True)
        mock_task.delay.assert_not_called()
        self.assertEqual(
            AuditLog.objects.filter(event_type="accounts.ContractorVerificationDecided").count(), 1,
        )

    @patch("apps.notifications.subscribers.send_email_task")
    def test_admin_save_model_does_not_publish_on_create(self, mock_task):
        """change=False (создание нового профиля) — событие не публикуется,
        независимо от значения verification_status на новом объекте."""
        new_contractor = make_contractor(email="new-contractor@test.kz")
        new_profile = ContractorProfile(user=new_contractor, verification_status=VerificationStatus.VERIFIED)
        admin_instance = self._make_admin()
        admin_instance.save_model(self._fake_request(), new_profile, form=None, change=False)
        mock_task.delay.assert_not_called()
