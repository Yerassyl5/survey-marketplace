"""Этапы 1-2 блока 1.11: подписчики доменных событий + журнал."""
from __future__ import annotations

from unittest.mock import patch

from django.contrib.admin.sites import AdminSite
from django.test import RequestFactory, TestCase

from apps.accounts.admin import ContractorProfileAdmin
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

    @patch("apps.notifications.subscribers.send_email_task")
    def test_verified_decision_queues_email(self, mock_task):
        publish(ContractorVerificationDecided(
            contractor_id=self.contractor.id, decision=VerificationStatus.VERIFIED, rejection_reason="",
        ))
        mock_task.delay.assert_called_once()
        _, kwargs = mock_task.delay.call_args
        self.assertEqual(kwargs["context"]["decision"], VerificationStatus.VERIFIED)

    @patch("apps.notifications.subscribers.send_email_task")
    def test_rejected_decision_includes_reason(self, mock_task):
        publish(ContractorVerificationDecided(
            contractor_id=self.contractor.id, decision=VerificationStatus.REJECTED,
            rejection_reason="Скан лицензии нечитаем",
        ))
        _, kwargs = mock_task.delay.call_args
        self.assertEqual(kwargs["context"]["rejection_reason"], "Скан лицензии нечитаем")

    def _make_admin(self):
        return ContractorProfileAdmin(ContractorProfile, AdminSite())

    def _fake_request(self):
        return RequestFactory().get("/admin/")

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
