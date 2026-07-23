"""Этап 1 блока 1.11: первый подписчик доменных событий + журнал."""
from __future__ import annotations

from unittest.mock import patch

from django.test import TestCase

from apps.accounts.models import Role, User
from apps.geo.models import City
from apps.marketplace.events import BidConsidered
from apps.marketplace.models import LocationType, Request
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
