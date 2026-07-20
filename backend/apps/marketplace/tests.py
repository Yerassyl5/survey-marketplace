"""Смок-тест полного цикла 1.4: заявка → отклик → выбор → сдача → принятие."""
from __future__ import annotations

from datetime import timedelta
from unittest.mock import patch

from django.contrib.gis.geos import Point
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import ContractorProfile, Role, User, VerificationStatus
from apps.geo.models import City, District, Region
from apps.reputation.models import Review
from apps.sites.models import Site

from .events import BidConsidered, BidWithdrawn, ResultReturned
from .models import Bid, BidStatus, LocationType, Request, RequestStatus, ResultEntryKind


def make_customer(email="customer@test.kz"):
    return User.objects.create_user(
        email=email, password="pass", role=Role.CUSTOMER,
        person_type="individual", full_name="Заказчик Тест", phone="700",
    )


def make_contractor(email="contractor@test.kz", verified=False):
    user = User.objects.create_user(
        email=email, password="pass", role=Role.CONTRACTOR,
        person_type="individual", full_name="Исполнитель Тест", phone="701",
    )
    vs = VerificationStatus.VERIFIED if verified else VerificationStatus.PENDING
    ContractorProfile.objects.create(user=user, verification_status=vs)
    return user


def make_site(owner):
    return Site.objects.create(owner=owner, geometry=Point(76.9, 43.2))


def make_city(name="Алматы", region=None):
    """Город республиканского значения по умолчанию (region=None), как Алматы/Астана/Шымкент.
    get_or_create — справочник уже наполнен data-миграцией geo.0002_load_kato_data."""
    city, _ = City.objects.get_or_create(name=name, region=region)
    return city


def make_district():
    region, _ = Region.objects.get_or_create(name="Акмолинская область")
    district, _ = District.objects.get_or_create(region=region, name="Аршалынский район")
    return region, district


class RequestLifecycleTest(TestCase):
    def setUp(self):
        self.customer = make_customer()
        self.contractor = make_contractor()
        self.site = make_site(self.customer)
        self.city = make_city()
        self.client_c = APIClient()   # клиент заказчика
        self.client_e = APIClient()   # клиент исполнителя
        self.client_c.force_authenticate(self.customer)
        self.client_e.force_authenticate(self.contractor)

    def _bid_payload(self, **overrides):
        payload = {"comment": "Готов выполнить", "price": "150000.00", "deadline_days": 14}
        payload.update(overrides)
        return payload

    # ------------------------------------------------------------------
    # Создание заявки
    # ------------------------------------------------------------------
    def test_customer_creates_request(self):
        r = self.client_c.post("/api/marketplace/requests/", {
            "site": self.site.id,
            "work_type": "geodesy",
            "description": "Топосъёмка участка",
            "location_type": "city",
            "city": self.city.id,
        }, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.data["status"], RequestStatus.OPEN)
        self.assertEqual(r.data["location_display"], "Алматы")

    def test_customer_creates_request_with_district(self):
        _, district = make_district()
        r = self.client_c.post("/api/marketplace/requests/", {
            "site": self.site.id,
            "work_type": "geodesy",
            "description": "Топосъёмка участка",
            "location_type": "district",
            "district": district.id,
        }, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.data["location_display"], "Акмолинская область, Аршалынский район")

    def test_request_city_type_requires_city_field(self):
        r = self.client_c.post("/api/marketplace/requests/", {
            "site": self.site.id, "work_type": "geodesy",
            "description": "x", "location_type": "city",
        }, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("city", r.data)

    def test_request_district_type_forbids_city_field(self):
        _, district = make_district()
        r = self.client_c.post("/api/marketplace/requests/", {
            "site": self.site.id, "work_type": "geodesy",
            "description": "x", "location_type": "district",
            "district": district.id, "city": self.city.id,
        }, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("city", r.data)

    def test_contractor_cannot_create_request(self):
        r = self.client_e.post("/api/marketplace/requests/", {
            "site": self.site.id, "work_type": "geodesy",
            "description": "x", "location_type": "city", "city": self.city.id,
        }, format="json")
        self.assertEqual(r.status_code, 403)

    def test_anon_cannot_create_request(self):
        r = APIClient().post("/api/marketplace/requests/", {
            "site": self.site.id, "work_type": "geodesy",
            "description": "x", "location_type": "city", "city": self.city.id,
        }, format="json")
        self.assertEqual(r.status_code, 401)

    def test_customer_cannot_create_request_with_foreign_site(self):
        """Заказчик не может подставить чужой site_id — Site.owner проверяется."""
        other_customer = make_customer("other-owner@test.kz")
        foreign_site = make_site(other_customer)
        r = self.client_c.post("/api/marketplace/requests/", {
            "site": foreign_site.id, "work_type": "geodesy",
            "description": "x", "location_type": "city", "city": self.city.id,
        }, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("site", r.data)

    # ------------------------------------------------------------------
    # Лента и доступ к заявке
    # ------------------------------------------------------------------
    def _create_request(self):
        req = Request.objects.create(
            site=self.site, customer=self.customer,
            work_type="geodesy", description="x",
            location_type=LocationType.CITY, city=self.city,
        )
        return req

    def test_contractor_sees_open_feed(self):
        self._create_request()
        r = self.client_e.get("/api/marketplace/requests/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["count"], 1)
        self.assertEqual(len(r.data["results"]), 1)

    def test_feed_today_count(self):
        req_today = self._create_request()
        req_old = self._create_request()
        Request.objects.filter(pk=req_old.pk).update(created_at=timezone.now() - timedelta(days=2))
        r = self.client_e.get("/api/marketplace/requests/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["count"], 2)
        self.assertEqual(r.data["today_count"], 1)
        self.assertIn(req_today.id, [item["id"] for item in r.data["results"]])

    def test_contractor_feed_hides_bids_count_shows_customer(self):
        """Исполнитель не должен видеть число откликов (защита от манипуляции ценами),
        но видит заказчика (открытая информация — кто разместил заявку)."""
        req = self._create_request()
        Bid.objects.create(request=req, contractor=self.contractor, price=100000, deadline_days=10)
        r = self.client_e.get("/api/marketplace/requests/")
        self.assertEqual(r.status_code, 200)
        self.assertNotIn("bids_count", r.data["results"][0])
        self.assertIn("customer", r.data["results"][0])
        self.assertEqual(r.data["results"][0]["customer"]["full_name"], "Заказчик Тест")
        self.assertNotIn("status", r.data["results"][0])

    def test_customer_own_requests_show_bids_count_not_customer(self):
        """Заказчик видит число откликов на СВОИ заявки; поле customer ему не нужно (это он сам)."""
        req = self._create_request()
        Bid.objects.create(request=req, contractor=self.contractor, price=100000, deadline_days=10)
        r = self.client_c.get("/api/marketplace/requests/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["results"][0]["bids_count"], 1)
        self.assertNotIn("customer", r.data["results"][0])

    def test_customer_sees_own_requests_only(self):
        self._create_request()
        other_customer = make_customer("other@test.kz")
        client2 = APIClient()
        client2.force_authenticate(other_customer)
        r = client2.get("/api/marketplace/requests/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["count"], 0)

    def test_contractor_cannot_see_customers_request_detail_if_not_open(self):
        req = self._create_request()
        req.status = RequestStatus.AWARDED
        req.assigned_contractor = make_contractor("other2@test.kz")
        req.save()
        r = self.client_e.get(f"/api/marketplace/requests/{req.id}/")
        self.assertEqual(r.status_code, 404)

    # ------------------------------------------------------------------
    # Доступ к заявке через собственный отклик (баг: проигравший терял
    # доступ к своей истории после awarded) + my_bid
    # ------------------------------------------------------------------
    def test_contractor_detail_no_multiple_objects_returned_with_rival_bids(self):
        """Регрессия на размножение строк через JOIN: если условие «это мой
        отклик» на RequestDetailView когда-нибудь «упростят» обратно на
        Q(bids__contractor=user) вместо id__in=Bid.objects...values("request_id"),
        Django построит JOIN на marketplace_bid прямо в основном запросе (не
        EXISTS-подзапрос, как у аннотации has_bid) — и на заявке с несколькими
        откликами ОТ РАЗНЫХ исполнителей .get(pk=X) внутри get_object_or_404
        упадёт MultipleObjectsReturned (500), а не просто вернёт неверные
        данные. Три отклика от трёх разных исполнителей на уже awarded
        заявке — доступ возможен ТОЛЬКО через «это мой отклик» (не через
        FEED_VISIBLE_STATUSES, не через assigned_contractor), ровно тот путь,
        который чинили."""
        req = self._create_request()
        my_bid = Bid.objects.create(
            request=req, contractor=self.contractor, price=100000, deadline_days=10,
            considered_at=timezone.now(),
        )
        rival1 = make_contractor("rival-detail-1@test.kz")
        rival2 = make_contractor("rival-detail-2@test.kz")
        Bid.objects.create(request=req, contractor=rival1, price=90000, deadline_days=8, considered_at=timezone.now())
        winner_bid = Bid.objects.create(
            request=req, contractor=rival2, price=80000, deadline_days=7, considered_at=timezone.now(),
        )
        Request.objects.filter(pk=req.pk).update(status=RequestStatus.UNDER_REVIEW)
        self.client_c.post(f"/api/marketplace/requests/{req.id}/award/", {"bid_id": winner_bid.id}, format="json")

        r = self.client_e.get(f"/api/marketplace/requests/{req.id}/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["my_bid"]["id"], my_bid.id)

    def test_rejected_contractor_sees_own_bid_not_request_status(self):
        """Пункт 4 (баг): проигравший теперь ОТКРЫВАЕТ заявку (не 404) — это
        часть его истории («Мои отклики»). Пункт 5/инвариант №9: при этом он
        получает ТОЛЬКО my_bid (свой отклик) — status/assigned_contractor/
        result_files/result_note структурно отсутствуют, потому что условие
        раскрытия в RequestFeedDetailSerializer.to_representation — строго
        assigned_contractor_id == viewer.id, а не «есть my_bid» (проигравший
        удовлетворяет второму, но не первому). Прямая пара с
        test_winner_sees_status_result_files_and_note — тот же сценарий,
        только с точки зрения победителя, единственный способ поймать
        перепутанное условие."""
        req = self._create_request()
        bid = Bid.objects.create(
            request=req, contractor=self.contractor, price=100000, deadline_days=10,
            considered_at=timezone.now(),
        )
        winner = make_contractor("winner-detail@test.kz")
        winner_bid = Bid.objects.create(
            request=req, contractor=winner, price=90000, deadline_days=8, considered_at=timezone.now(),
        )
        Request.objects.filter(pk=req.pk).update(status=RequestStatus.UNDER_REVIEW)
        self.client_c.post(f"/api/marketplace/requests/{req.id}/award/", {"bid_id": winner_bid.id}, format="json")

        r = self.client_e.get(f"/api/marketplace/requests/{req.id}/")
        self.assertEqual(r.status_code, 200)
        self.assertNotIn("status", r.data)
        self.assertNotIn("assigned_contractor", r.data)
        self.assertNotIn("result_files", r.data)
        self.assertNotIn("result_note", r.data)
        self.assertIn("my_bid", r.data)
        self.assertEqual(r.data["my_bid"]["id"], bid.id)
        self.assertEqual(r.data["my_bid"]["status"], "rejected")
        self.assertIsNotNone(r.data["my_bid"]["considered_at"])

    def test_winner_sees_status_result_files_and_note(self):
        """Раскрытие для победителя (условие assigned_contractor_id ==
        viewer.id) — нужно для будущей панели сдачи результата. result_files
        пуст (сдачи ещё не было), result_note — пустая строка (blank=True на
        модели). Сравнить с test_rejected_contractor_sees_own_bid_not_request_status —
        тем же сценарием, но с точки зрения проигравшего."""
        req = self._create_request()
        winner_bid = Bid.objects.create(
            request=req, contractor=self.contractor, price=100000, deadline_days=10,
            considered_at=timezone.now(),
        )
        Request.objects.filter(pk=req.pk).update(status=RequestStatus.UNDER_REVIEW)
        self.client_c.post(f"/api/marketplace/requests/{req.id}/award/", {"bid_id": winner_bid.id}, format="json")

        r = self.client_e.get(f"/api/marketplace/requests/{req.id}/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["status"], RequestStatus.AWARDED)
        self.assertEqual(r.data["result_files"], [])
        self.assertEqual(r.data["result_note"], "")
        self.assertIn("my_bid", r.data)

    def test_winner_sees_result_entries_loser_does_not(self):
        """Инвариант №9 на ЛЕНТЕ РЕЗУЛЬТАТА конкретно — не полагаемся на то, что
        assert'ы в test_return_note_visible_to_winner_not_to_loser это уже
        косвенно проверили (тот тест назван и сфокусирован на return_note).
        Фронт тянет result_entries тем же detail-эндпоинтом, где уже дважды
        находили дыры (Блок 5 — status/result_files/result_note, эта сессия —
        return_note) — отдельный именованный тест ОБЯЗАТЕЛЕН, тот же паттерн,
        что test_winner_sees_status_result_files_and_note /
        test_rejected_contractor_sees_own_bid_not_request_status."""
        req = self._create_request()
        winner_bid = Bid.objects.create(
            request=req, contractor=self.contractor, price=100000, deadline_days=10,
            considered_at=timezone.now(),
        )
        loser = make_contractor("loser-entries@test.kz")
        Bid.objects.create(
            request=req, contractor=loser, price=95000, deadline_days=9, considered_at=timezone.now(),
        )
        Request.objects.filter(pk=req.pk).update(status=RequestStatus.UNDER_REVIEW)
        self.client_c.post(f"/api/marketplace/requests/{req.id}/award/", {"bid_id": winner_bid.id}, format="json")
        file = SimpleUploadedFile("report.pdf", b"fake pdf content", content_type="application/pdf")
        self.client_e.post(f"/api/marketplace/requests/{req.id}/submit-result/", {
            "result_files": file, "result_note": "Отчёт готов",
        })

        r_winner = self.client_e.get(f"/api/marketplace/requests/{req.id}/")
        self.assertEqual(r_winner.status_code, 200)
        self.assertIn("result_entries", r_winner.data)
        self.assertEqual(len(r_winner.data["result_entries"]), 1)
        self.assertEqual(r_winner.data["result_entries"][0]["kind"], "submitted")
        self.assertEqual(r_winner.data["result_entries"][0]["text"], "Отчёт готов")
        self.assertEqual(len(r_winner.data["result_entries"][0]["files"]), 1)

        loser_client = APIClient()
        loser_client.force_authenticate(user=loser)
        r_loser = loser_client.get(f"/api/marketplace/requests/{req.id}/")
        self.assertEqual(r_loser.status_code, 200)
        self.assertNotIn("result_entries", r_loser.data)
        self.assertIn("my_bid", r_loser.data)

    def test_bidder_sees_no_status_while_under_review(self):
        """До award (assigned_contractor is None) условие раскрытия не может
        выполниться ни для кого, включая самого откликнувшегося — status/
        result_files/result_note отсутствуют, даже пока заявка «ждёт
        рассмотрения», а не только после того, как её отдали другому."""
        req = self._create_request()
        Bid.objects.create(
            request=req, contractor=self.contractor, price=100000, deadline_days=10,
        )
        Request.objects.filter(pk=req.pk).update(status=RequestStatus.UNDER_REVIEW)

        r = self.client_e.get(f"/api/marketplace/requests/{req.id}/")
        self.assertEqual(r.status_code, 200)
        self.assertNotIn("status", r.data)
        self.assertNotIn("result_files", r.data)
        self.assertNotIn("result_note", r.data)
        self.assertIn("my_bid", r.data)

    def test_my_bid_absent_when_contractor_has_not_bid(self):
        req = self._create_request()
        r = self.client_e.get(f"/api/marketplace/requests/{req.id}/")
        self.assertEqual(r.status_code, 200)
        self.assertNotIn("my_bid", r.data)

    def test_my_bid_reflects_own_bid_fields(self):
        req = self._create_request()
        bid = Bid.objects.create(
            request=req, contractor=self.contractor, price=123456, deadline_days=15, comment="моя заявка",
        )
        r = self.client_e.get(f"/api/marketplace/requests/{req.id}/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["my_bid"]["id"], bid.id)
        self.assertEqual(r.data["my_bid"]["price"], "123456.00")
        self.assertEqual(r.data["my_bid"]["deadline_days"], 15)
        self.assertEqual(r.data["my_bid"]["comment"], "моя заявка")
        self.assertEqual(r.data["my_bid"]["status"], "pending")
        self.assertIsNone(r.data["my_bid"]["considered_at"])

    def test_contractor_detail_includes_site_geometry(self):
        req = self._create_request()
        r = self.client_e.get(f"/api/marketplace/requests/{req.id}/")
        self.assertEqual(r.status_code, 200)
        self.assertIn("site_geometry", r.data)
        geom = r.data["site_geometry"]
        # Голая GeoJSON-геометрия (bare GeometryField), НЕ Feature: только
        # type/coordinates, без обёртки "properties" (в отличие от
        # sites.SiteSerializer, который строит целый Feature).
        self.assertEqual(set(geom.keys()), {"type", "coordinates"})
        self.assertEqual(geom["type"], "Point")
        self.assertNotIn("properties", geom)

    def test_feed_list_does_not_include_site_geometry(self):
        """site_geometry — только на детальной странице заявки, список ленты
        им не раздувается (RequestFeedSerializer, не RequestFeedDetailSerializer)."""
        self._create_request()
        r = self.client_e.get("/api/marketplace/requests/")
        self.assertEqual(r.status_code, 200)
        self.assertNotIn("site_geometry", r.data["results"][0])

    def test_awarded_request_disappears_from_contractor_feed(self):
        req = self._create_request()
        req.status = RequestStatus.AWARDED
        req.save()
        r = self.client_e.get("/api/marketplace/requests/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["count"], 0)

    # ------------------------------------------------------------------
    # Заказчик: общая лента (?scope=feed) — обезличенная для чужих заявок
    # ------------------------------------------------------------------
    def test_customer_default_scope_still_own_only(self):
        """Без ?scope=feed поведение для заказчика не меняется — это «Мои заявки»."""
        self._create_request()
        other_customer = make_customer("other-feed@test.kz")
        other_site = make_site(other_customer)
        Request.objects.create(
            site=other_site, customer=other_customer,
            work_type="geology", description="чужая",
            location_type=LocationType.CITY, city=self.city,
        )
        r = self.client_c.get("/api/marketplace/requests/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["count"], 1)

    def test_customer_feed_scope_shows_all_open_requests(self):
        self._create_request()
        other_customer = make_customer("other-feed2@test.kz")
        other_site = make_site(other_customer)
        Request.objects.create(
            site=other_site, customer=other_customer,
            work_type="geology", description="чужая",
            location_type=LocationType.CITY, city=self.city,
        )
        r = self.client_c.get("/api/marketplace/requests/?scope=feed")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["count"], 2)

    def test_customer_feed_scope_anonymizes_other_customers_only(self):
        own_req = self._create_request()
        other_customer = make_customer("other-feed3@test.kz")
        other_site = make_site(other_customer)
        foreign_req = Request.objects.create(
            site=other_site, customer=other_customer,
            work_type="geology", description="чужая",
            location_type=LocationType.CITY, city=self.city,
        )
        r = self.client_c.get("/api/marketplace/requests/?scope=feed")
        self.assertEqual(r.status_code, 200)
        by_id = {item["id"]: item["customer"] for item in r.data["results"]}
        self.assertEqual(by_id[own_req.id]["full_name"], "Заказчик Тест")
        self.assertEqual(by_id[foreign_req.id]["full_name"], "Заказчик")
        self.assertIsNone(by_id[foreign_req.id]["id"])

    def test_customer_feed_scope_excludes_has_bid(self):
        self._create_request()
        r = self.client_c.get("/api/marketplace/requests/?scope=feed")
        self.assertEqual(r.status_code, 200)
        self.assertNotIn("has_bid", r.data["results"][0])

    def test_customer_can_view_foreign_open_request_detail_anonymized(self):
        other_customer = make_customer("other-detail@test.kz")
        other_site = make_site(other_customer)
        foreign_req = Request.objects.create(
            site=other_site, customer=other_customer,
            work_type="geology", description="чужая",
            location_type=LocationType.CITY, city=self.city,
        )
        r = self.client_c.get(f"/api/marketplace/requests/{foreign_req.id}/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["customer"]["full_name"], "Заказчик")
        self.assertIn("site_geometry", r.data)

    def test_customer_cannot_view_foreign_non_open_request_detail(self):
        other_customer = make_customer("other-detail2@test.kz")
        other_site = make_site(other_customer)
        foreign_req = Request.objects.create(
            site=other_site, customer=other_customer,
            work_type="geology", description="чужая", status=RequestStatus.AWARDED,
            location_type=LocationType.CITY, city=self.city,
        )
        r = self.client_c.get(f"/api/marketplace/requests/{foreign_req.id}/")
        self.assertEqual(r.status_code, 404)

    def test_customer_sees_own_request_detail_fully_even_if_not_open(self):
        req = self._create_request()
        req.status = RequestStatus.AWARDED
        req.save()
        r = self.client_c.get(f"/api/marketplace/requests/{req.id}/")
        self.assertEqual(r.status_code, 200)
        self.assertNotIn("customer", r.data)
        self.assertEqual(r.data["status"], RequestStatus.AWARDED)

    # ------------------------------------------------------------------
    # Отклик (мягкий вариант — неверифицированный пропускается)
    # ------------------------------------------------------------------
    def test_unverified_contractor_can_bid(self):
        req = self._create_request()
        r = self.client_e.post(f"/api/marketplace/requests/{req.id}/bids/", self._bid_payload(), format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(str(r.data["price"]), "150000.00")
        self.assertEqual(r.data["deadline_days"], 14)

    def test_bid_requires_price_and_deadline(self):
        req = self._create_request()
        r = self.client_e.post(f"/api/marketplace/requests/{req.id}/bids/", {
            "comment": "Без цены и срока"
        }, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("price", r.data)
        self.assertIn("deadline_days", r.data)

    def test_verification_status_visible_in_bid(self):
        req = self._create_request()
        self.client_e.post(f"/api/marketplace/requests/{req.id}/bids/", self._bid_payload(), format="json")
        r = self.client_c.get(f"/api/marketplace/requests/{req.id}/bids/")
        self.assertEqual(r.status_code, 200)
        self.assertIn("verification_status", r.data[0]["contractor"])
        self.assertEqual(r.data[0]["contractor"]["verification_status"], VerificationStatus.PENDING)

    def test_duplicate_bid_rejected(self):
        req = self._create_request()
        self.client_e.post(f"/api/marketplace/requests/{req.id}/bids/", self._bid_payload(), format="json")
        r = self.client_e.post(f"/api/marketplace/requests/{req.id}/bids/", self._bid_payload(), format="json")
        self.assertIn(r.status_code, [400, 409])
        # Регресс-тест: раньше ValidationError("...") сериализовался DRF в голый
        # список ["..."] без ключа "detail" — фронтенд не мог вытащить сообщение.
        self.assertIn("detail", r.data)
        self.assertEqual(r.data["detail"], "Вы уже откликнулись на эту заявку.")

    def test_feed_has_bid_flag(self):
        req_with_bid = self._create_request()
        req_without_bid = self._create_request()
        Bid.objects.create(request=req_with_bid, contractor=self.contractor, price=100000, deadline_days=10)
        r = self.client_e.get("/api/marketplace/requests/")
        self.assertEqual(r.status_code, 200)
        by_id = {item["id"]: item["has_bid"] for item in r.data["results"]}
        self.assertTrue(by_id[req_with_bid.id])
        self.assertFalse(by_id[req_without_bid.id])

    def test_customer_cannot_bid(self):
        req = self._create_request()
        r = self.client_c.post(f"/api/marketplace/requests/{req.id}/bids/", {}, format="json")
        self.assertEqual(r.status_code, 403)

    def test_contractor_cannot_list_bids(self):
        req = self._create_request()
        r = self.client_e.get(f"/api/marketplace/requests/{req.id}/bids/")
        self.assertEqual(r.status_code, 403)

    # ------------------------------------------------------------------
    # Рассмотрение и автопереход open → under_review (Блок 1)
    # ------------------------------------------------------------------
    def test_first_bid_moves_request_to_under_review(self):
        req = self._create_request()
        r = self.client_e.post(f"/api/marketplace/requests/{req.id}/bids/", self._bid_payload(), format="json")
        self.assertEqual(r.status_code, 201)
        req.refresh_from_db()
        self.assertEqual(req.status, RequestStatus.UNDER_REVIEW)

    def test_first_bid_does_not_change_updated_at(self):
        """Инвариант №9: переход статуса — через .update(), не .save(), иначе
        auto_now тронул бы updated_at и дал бы утечку через фид-сериализатор."""
        req = self._create_request()
        original_updated_at = req.updated_at
        self.client_e.post(f"/api/marketplace/requests/{req.id}/bids/", self._bid_payload(), format="json")
        req.refresh_from_db()
        self.assertEqual(req.status, RequestStatus.UNDER_REVIEW)
        self.assertEqual(req.updated_at, original_updated_at)

    def test_under_review_request_still_visible_in_contractor_feed(self):
        """FEED_VISIBLE_STATUSES = (open, under_review) — заявка не пропадает
        из ленты при первом отклике; status/updated_at по-прежнему не отдаются."""
        req = self._create_request()
        self.client_e.post(f"/api/marketplace/requests/{req.id}/bids/", self._bid_payload(), format="json")
        r = self.client_e.get("/api/marketplace/requests/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["count"], 1)
        self.assertNotIn("status", r.data["results"][0])
        self.assertNotIn("updated_at", r.data["results"][0])

    def test_second_contractor_can_bid_after_first(self):
        req = self._create_request()
        self.client_e.post(f"/api/marketplace/requests/{req.id}/bids/", self._bid_payload(), format="json")
        second = make_contractor("second-bidder@test.kz")
        client2 = APIClient()
        client2.force_authenticate(second)
        r = client2.post(f"/api/marketplace/requests/{req.id}/bids/", self._bid_payload(), format="json")
        self.assertEqual(r.status_code, 201)

    def test_award_rejects_unconsidered_bid(self):
        req = self._create_request()
        bid = Bid.objects.create(request=req, contractor=self.contractor, price=100000, deadline_days=10)
        Request.objects.filter(pk=req.pk).update(status=RequestStatus.UNDER_REVIEW)
        r = self.client_c.post(f"/api/marketplace/requests/{req.id}/award/", {"bid_id": bid.id}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("рассмотр", r.data["detail"].lower())
        req.refresh_from_db()
        self.assertEqual(req.status, RequestStatus.UNDER_REVIEW)

    # ------------------------------------------------------------------
    # Рассмотрение отклика (consider) и раскрытие телефона (Блок 2)
    # ------------------------------------------------------------------
    def test_contractor_sees_exactly_own_bid_among_many(self):
        """Пять исполнителей откликаются на одну заявку — каждый в своих
        «моих откликах» видит РОВНО ОДИН объект (свой), не пять с урезанными
        полями (иначе длина массива выдала бы число конкурентов — тот же канал
        утечки, что и с updated_at)."""
        req = self._create_request()
        contractors = [make_contractor(f"rival{i}@test.kz") for i in range(5)]
        for c in contractors:
            Bid.objects.create(request=req, contractor=c, price=100000, deadline_days=10)
        client = APIClient()
        client.force_authenticate(contractors[0])
        r = client.get("/api/marketplace/my-bids/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data), 1)
        self.assertEqual(r.data[0]["contractor"]["id"], contractors[0].id)

    def test_customer_sees_all_bids_on_own_request(self):
        req = self._create_request()
        Bid.objects.create(request=req, contractor=self.contractor, price=100000, deadline_days=10)
        second = make_contractor("second-viewer@test.kz")
        Bid.objects.create(request=req, contractor=second, price=90000, deadline_days=8)
        r = self.client_c.get(f"/api/marketplace/requests/{req.id}/bids/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data), 2)

    def test_customer_cannot_see_bids_on_foreign_request(self):
        other_customer = make_customer("other-bids-owner@test.kz")
        other_site = make_site(other_customer)
        foreign_req = Request.objects.create(
            site=other_site, customer=other_customer,
            work_type="geology", description="чужая",
            location_type=LocationType.CITY, city=self.city,
        )
        Bid.objects.create(request=foreign_req, contractor=self.contractor, price=100000, deadline_days=10)
        r = self.client_c.get(f"/api/marketplace/requests/{foreign_req.id}/bids/")
        self.assertEqual(r.status_code, 404)

    def test_contractor_phone_hidden_before_consider(self):
        req = self._create_request()
        Bid.objects.create(request=req, contractor=self.contractor, price=100000, deadline_days=10)
        r = self.client_c.get(f"/api/marketplace/requests/{req.id}/bids/")
        self.assertEqual(r.status_code, 200)
        self.assertIsNone(r.data[0]["contractor_phone"])
        self.assertIsNone(r.data[0]["considered_at"])

    def test_contractor_phone_revealed_after_consider(self):
        req = self._create_request()
        bid = Bid.objects.create(request=req, contractor=self.contractor, price=100000, deadline_days=10)
        r = self.client_c.post(f"/api/marketplace/bids/{bid.id}/consider/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["contractor_phone"], self.contractor.phone)
        self.assertIsNotNone(r.data["considered_at"])
        r2 = self.client_c.get(f"/api/marketplace/requests/{req.id}/bids/")
        self.assertEqual(r2.data[0]["contractor_phone"], self.contractor.phone)

    def test_contractor_never_sees_own_phone_field(self):
        """Одностороннее раскрытие — исполнитель не получает contractor_phone
        даже в своих собственных откликах, независимо от considered_at."""
        req = self._create_request()
        bid = Bid.objects.create(
            request=req, contractor=self.contractor, price=100000, deadline_days=10,
            considered_at=timezone.now(),
        )
        r = self.client_e.get("/api/marketplace/my-bids/")
        self.assertEqual(r.status_code, 200)
        self.assertNotIn("contractor_phone", r.data[0])
        self.assertIsNotNone(r.data[0]["considered_at"])

    def test_my_bids_includes_request_summary(self):
        """«Мои отклики» без данных заявки нечего рендерить — раздел показывает,
        НА ЧТО откликался исполнитель, не только цену/срок своего предложения."""
        req = self._create_request()
        Bid.objects.create(request=req, contractor=self.contractor, price=100000, deadline_days=10)
        r = self.client_e.get("/api/marketplace/my-bids/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data[0]["request"]["id"], req.id)
        self.assertEqual(r.data[0]["request"]["work_type"], "geodesy")
        self.assertEqual(r.data[0]["request"]["location_display"], "Алматы")
        self.assertEqual(r.data[0]["request"]["description"], "x")

    def test_my_bids_request_never_exposes_status(self):
        """Инвариант №9: «Мои отклики» вычисляет статус из considered_at/Bid.status,
        не из Request.status — поле не должно утечь ни на верхнем уровне ответа,
        ни во вложенном request, независимо от реального статуса заявки."""
        req = self._create_request()
        Bid.objects.create(request=req, contractor=self.contractor, price=100000, deadline_days=10)
        Request.objects.filter(pk=req.pk).update(status=RequestStatus.UNDER_REVIEW)
        r = self.client_e.get("/api/marketplace/my-bids/")
        self.assertEqual(r.status_code, 200)
        self.assertNotIn("status", r.data[0]["request"])
        self.assertIn("status", r.data[0])  # это Bid.status ("pending") — легитимно, другое поле

    def test_my_bids_location_display_does_not_n_plus_one(self):
        """BidRequestBriefSerializer.get_location_display() читает
        Request.location_label, который для CITY трогает request.city, а для
        DISTRICT — request.district И request.district.region. MyBidListView
        select_related покрывает только request/contractor/contractor__profile —
        без request__city/request__district/request__district__region это N+1
        на каждый отклик. Проверяем количеством запросов, не чтением кода:
        число запросов на 1 отклик и на 4 (2 city + 2 district, разные
        объекты, чтобы не спрятать N+1 за identity map на одном и том же
        FK) должно совпадать — иначе запросы растут с числом откликов."""
        _, district = make_district()
        second_city = make_city("Костанай")

        def make_bid(*, location_type, city=None, district_=None):
            req = Request.objects.create(
                site=self.site, customer=self.customer,
                work_type="geodesy", description="x",
                location_type=location_type, city=city, district=district_,
            )
            return Bid.objects.create(
                request=req, contractor=self.contractor, price=100000, deadline_days=10,
            )

        make_bid(location_type=LocationType.CITY, city=self.city)
        with CaptureQueriesContext(connection) as ctx_one:
            r = self.client_e.get("/api/marketplace/my-bids/")
        self.assertEqual(r.status_code, 200)
        queries_for_one = len(ctx_one.captured_queries)

        make_bid(location_type=LocationType.CITY, city=second_city)
        make_bid(location_type=LocationType.DISTRICT, district_=district)
        make_bid(location_type=LocationType.DISTRICT, district_=district)
        with CaptureQueriesContext(connection) as ctx_four:
            r = self.client_e.get("/api/marketplace/my-bids/")
        self.assertEqual(r.status_code, 200)
        queries_for_four = len(ctx_four.captured_queries)

        self.assertEqual(
            queries_for_one, queries_for_four,
            f"Запросы растут с числом откликов: {queries_for_one} на 1, "
            f"{queries_for_four} на 4 — не хватает select_related.",
        )

    # ------------------------------------------------------------------
    # «В работе и выполненные» (MyAwardedListView)
    # ------------------------------------------------------------------
    def test_my_awarded_lists_only_selected_bids(self):
        """architecture.md §4.3: фильтр по Bid.status=selected, не по
        Request.assigned_contractor — заявка, где тот же исполнитель просто
        откликнулся (pending), в «В работе» не попадает."""
        req = self._create_request()
        bid = Bid.objects.create(
            request=req, contractor=self.contractor, price=100000, deadline_days=10,
            considered_at=timezone.now(),
        )
        Request.objects.filter(pk=req.pk).update(status=RequestStatus.UNDER_REVIEW)
        self.client_c.post(f"/api/marketplace/requests/{req.id}/award/", {"bid_id": bid.id}, format="json")

        other_req = self._create_request()
        Bid.objects.create(request=other_req, contractor=self.contractor, price=50000, deadline_days=5)

        r = self.client_e.get("/api/marketplace/my-awarded/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data), 1)
        self.assertEqual(r.data[0]["request"]["id"], req.id)

    def test_my_awarded_includes_status(self):
        """Здесь Request.status легитимен (см. BidRequestWithStatusSerializer) —
        исполнитель уже выиграл, статус нужен, чтобы понимать, где сделка."""
        req = self._create_request()
        bid = Bid.objects.create(
            request=req, contractor=self.contractor, price=100000, deadline_days=10,
            considered_at=timezone.now(),
        )
        Request.objects.filter(pk=req.pk).update(status=RequestStatus.UNDER_REVIEW)
        self.client_c.post(f"/api/marketplace/requests/{req.id}/award/", {"bid_id": bid.id}, format="json")

        r = self.client_e.get("/api/marketplace/my-awarded/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data[0]["request"]["status"], RequestStatus.AWARDED)

    def test_my_awarded_excludes_rejected_rival(self):
        """Проигравший отклик (status=rejected после award) не попадает в
        «В работе» проигравшего исполнителя — только у победителя status=selected."""
        req = self._create_request()
        winner_bid = Bid.objects.create(
            request=req, contractor=self.contractor, price=100000, deadline_days=10,
            considered_at=timezone.now(),
        )
        loser = make_contractor("loser@test.kz")
        Bid.objects.create(
            request=req, contractor=loser, price=90000, deadline_days=8,
            considered_at=timezone.now(),
        )
        Request.objects.filter(pk=req.pk).update(status=RequestStatus.UNDER_REVIEW)
        self.client_c.post(f"/api/marketplace/requests/{req.id}/award/", {"bid_id": winner_bid.id}, format="json")

        loser_client = APIClient()
        loser_client.force_authenticate(loser)
        r = loser_client.get("/api/marketplace/my-awarded/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data), 0)

    def test_my_awarded_requires_contractor_role(self):
        r = self.client_c.get("/api/marketplace/my-awarded/")
        self.assertEqual(r.status_code, 403)

    def test_my_awarded_location_display_does_not_n_plus_one(self):
        """Тот же паттерн N+1, что и в /my-bids/ (см. тест выше для MyBidListView) —
        MyAwardedListView использует ту же константу BID_REQUEST_SELECT_RELATED,
        проверяем это фактом, не полагаясь на то, что константа общая."""
        _, district = make_district()

        def make_selected_bid(*, location_type, city=None, district_=None):
            req = Request.objects.create(
                site=self.site, customer=self.customer,
                work_type="geodesy", description="x",
                location_type=location_type, city=city, district=district_,
            )
            bid = Bid.objects.create(
                request=req, contractor=self.contractor, price=100000, deadline_days=10,
                considered_at=timezone.now(), status=BidStatus.SELECTED,
            )
            Request.objects.filter(pk=req.pk).update(
                status=RequestStatus.AWARDED, assigned_contractor=self.contractor,
            )
            return bid

        make_selected_bid(location_type=LocationType.CITY, city=self.city)
        with CaptureQueriesContext(connection) as ctx_one:
            r = self.client_e.get("/api/marketplace/my-awarded/")
        self.assertEqual(r.status_code, 200)
        queries_for_one = len(ctx_one.captured_queries)

        make_selected_bid(location_type=LocationType.DISTRICT, district_=district)
        with CaptureQueriesContext(connection) as ctx_two:
            r = self.client_e.get("/api/marketplace/my-awarded/")
        self.assertEqual(r.status_code, 200)
        queries_for_two = len(ctx_two.captured_queries)

        self.assertEqual(
            queries_for_one, queries_for_two,
            f"Запросы растут с числом откликов: {queries_for_one} на 1, "
            f"{queries_for_two} на 2 — не хватает select_related.",
        )

    # ------------------------------------------------------------------
    # Отзыв отклика (WithdrawBidView)
    # ------------------------------------------------------------------
    def test_withdraw_last_bid_reverts_request_to_open(self):
        req = self._create_request()
        bid = Bid.objects.create(request=req, contractor=self.contractor, price=100000, deadline_days=10)
        Request.objects.filter(pk=req.pk).update(status=RequestStatus.UNDER_REVIEW)

        r = self.client_e.post(f"/api/marketplace/bids/{bid.id}/withdraw/")
        self.assertEqual(r.status_code, 200)
        self.assertFalse(Bid.objects.filter(pk=bid.pk).exists())
        req.refresh_from_db()
        self.assertEqual(req.status, RequestStatus.OPEN)

    def test_withdraw_one_of_two_keeps_request_under_review(self):
        req = self._create_request()
        bid = Bid.objects.create(request=req, contractor=self.contractor, price=100000, deadline_days=10)
        other = make_contractor("withdraw-rival@test.kz")
        Bid.objects.create(request=req, contractor=other, price=90000, deadline_days=8)
        Request.objects.filter(pk=req.pk).update(status=RequestStatus.UNDER_REVIEW)

        r = self.client_e.post(f"/api/marketplace/bids/{bid.id}/withdraw/")
        self.assertEqual(r.status_code, 200)
        self.assertFalse(Bid.objects.filter(pk=bid.pk).exists())
        req.refresh_from_db()
        self.assertEqual(req.status, RequestStatus.UNDER_REVIEW)

    def test_withdraw_considered_bid_rejected(self):
        req = self._create_request()
        bid = Bid.objects.create(
            request=req, contractor=self.contractor, price=100000, deadline_days=10,
            considered_at=timezone.now(),
        )
        Request.objects.filter(pk=req.pk).update(status=RequestStatus.UNDER_REVIEW)

        r = self.client_e.post(f"/api/marketplace/bids/{bid.id}/withdraw/")
        self.assertEqual(r.status_code, 409)
        self.assertTrue(Bid.objects.filter(pk=bid.pk).exists())

    def test_withdraw_rejected_without_review_is_rejected(self):
        """Пограничный случай, найденный при планировании: rejected БЕЗ
        considered_at («заявка закрыта» — заказчик выбрал другого, до этого
        отклика не дошли) имеет considered_at=None, но status != PENDING —
        withdraw должен отказать (409), не тихо удалить уже решённый отклик."""
        req = self._create_request()
        bid = Bid.objects.create(request=req, contractor=self.contractor, price=100000, deadline_days=10)
        winner = make_contractor("withdraw-winner@test.kz")
        winner_bid = Bid.objects.create(
            request=req, contractor=winner, price=90000, deadline_days=8, considered_at=timezone.now(),
        )
        Request.objects.filter(pk=req.pk).update(status=RequestStatus.UNDER_REVIEW)
        self.client_c.post(f"/api/marketplace/requests/{req.id}/award/", {"bid_id": winner_bid.id}, format="json")
        bid.refresh_from_db()
        self.assertEqual(bid.status, BidStatus.REJECTED)
        self.assertIsNone(bid.considered_at)

        r = self.client_e.post(f"/api/marketplace/bids/{bid.id}/withdraw/")
        self.assertEqual(r.status_code, 409)
        self.assertTrue(Bid.objects.filter(pk=bid.pk).exists())

    def test_withdraw_foreign_bid_not_found(self):
        req = self._create_request()
        other = make_contractor("withdraw-foreign@test.kz")
        bid = Bid.objects.create(request=req, contractor=other, price=100000, deadline_days=10)

        r = self.client_e.post(f"/api/marketplace/bids/{bid.id}/withdraw/")
        self.assertEqual(r.status_code, 404)
        self.assertTrue(Bid.objects.filter(pk=bid.pk).exists())

    def test_rebid_after_withdraw_succeeds(self):
        """unique_together("request", "contractor") не мешает повторному
        отклику после withdraw — строка была удалена, не помечена статусом."""
        req = self._create_request()
        bid = Bid.objects.create(request=req, contractor=self.contractor, price=100000, deadline_days=10)
        Request.objects.filter(pk=req.pk).update(status=RequestStatus.UNDER_REVIEW)
        self.client_e.post(f"/api/marketplace/bids/{bid.id}/withdraw/")

        r = self.client_e.post(f"/api/marketplace/requests/{req.id}/bids/", {
            "price": "95000.00", "deadline_days": 12, "comment": "новая цена",
        }, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(Bid.objects.filter(request=req, contractor=self.contractor).count(), 1)

    @patch("apps.marketplace.views.publish")
    def test_withdraw_publishes_event_once(self, mock_publish):
        req = self._create_request()
        bid = Bid.objects.create(request=req, contractor=self.contractor, price=100000, deadline_days=10)
        Request.objects.filter(pk=req.pk).update(status=RequestStatus.UNDER_REVIEW)

        r = self.client_e.post(f"/api/marketplace/bids/{bid.id}/withdraw/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(mock_publish.call_count, 1)
        published = mock_publish.call_args[0][0]
        self.assertIsInstance(published, BidWithdrawn)
        self.assertEqual(published.request_id, req.id)
        self.assertEqual(published.bid_id, bid.id)
        self.assertEqual(published.contractor_id, self.contractor.id)

    def test_consider_foreign_request_not_found(self):
        other_customer = make_customer("other-consider@test.kz")
        other_site = make_site(other_customer)
        foreign_req = Request.objects.create(
            site=other_site, customer=other_customer,
            work_type="geology", description="чужая",
            location_type=LocationType.CITY, city=self.city,
        )
        bid = Bid.objects.create(request=foreign_req, contractor=self.contractor, price=100000, deadline_days=10)
        r = self.client_c.post(f"/api/marketplace/bids/{bid.id}/consider/")
        self.assertEqual(r.status_code, 404)
        bid.refresh_from_db()
        self.assertIsNone(bid.considered_at)

    def test_consider_is_idempotent(self):
        req = self._create_request()
        bid = Bid.objects.create(request=req, contractor=self.contractor, price=100000, deadline_days=10)
        r1 = self.client_c.post(f"/api/marketplace/bids/{bid.id}/consider/")
        first_considered_at = r1.data["considered_at"]
        r2 = self.client_c.post(f"/api/marketplace/bids/{bid.id}/consider/")
        self.assertEqual(r2.status_code, 200)
        self.assertEqual(r2.data["considered_at"], first_considered_at)

    def test_consider_rejected_when_request_awarded(self):
        req = self._create_request()
        Request.objects.filter(pk=req.pk).update(status=RequestStatus.AWARDED)
        bid = Bid.objects.create(request=req, contractor=self.contractor, price=100000, deadline_days=10)
        r = self.client_c.post(f"/api/marketplace/bids/{bid.id}/consider/")
        self.assertEqual(r.status_code, 409)
        bid.refresh_from_db()
        self.assertIsNone(bid.considered_at)

    def test_consider_rejected_when_request_accepted(self):
        req = self._create_request()
        Request.objects.filter(pk=req.pk).update(status=RequestStatus.ACCEPTED)
        bid = Bid.objects.create(request=req, contractor=self.contractor, price=100000, deadline_days=10)
        r = self.client_c.post(f"/api/marketplace/bids/{bid.id}/consider/")
        self.assertEqual(r.status_code, 409)
        bid.refresh_from_db()
        self.assertIsNone(bid.considered_at)

    def test_consider_allowed_when_request_under_review(self):
        """Типовой случай: заявка уже под review (есть отклики), заказчик
        рассматривает ещё один/тот же отклик — должно работать (200)."""
        req = self._create_request()
        bid = Bid.objects.create(request=req, contractor=self.contractor, price=100000, deadline_days=10)
        Request.objects.filter(pk=req.pk).update(status=RequestStatus.UNDER_REVIEW)
        r = self.client_c.post(f"/api/marketplace/bids/{bid.id}/consider/")
        self.assertEqual(r.status_code, 200)
        self.assertIsNotNone(r.data["considered_at"])

    @patch("apps.marketplace.views.publish")
    def test_consider_publishes_event_once(self, mock_publish):
        req = self._create_request()
        bid = Bid.objects.create(request=req, contractor=self.contractor, price=100000, deadline_days=10)
        self.client_c.post(f"/api/marketplace/bids/{bid.id}/consider/")
        self.assertEqual(mock_publish.call_count, 1)
        published = mock_publish.call_args[0][0]
        self.assertIsInstance(published, BidConsidered)
        self.assertEqual(published.bid_id, bid.id)
        self.assertEqual(published.contractor_id, self.contractor.id)
        # Повторный вызов — событие больше не публикуется (идемпотентность).
        self.client_c.post(f"/api/marketplace/bids/{bid.id}/consider/")
        self.assertEqual(mock_publish.call_count, 1)

    # ------------------------------------------------------------------
    # Полный цикл: award → submit → accept
    # ------------------------------------------------------------------
    def _setup_bid(self):
        """Заявка с одним откликом, УЖЕ рассмотренным заказчиком (considered_at
        проставлен напрямую через ORM — эндпоинта «рассмотреть» пока нет, это
        следующий блок). Award теперь требует под_review + рассмотренный отклик,
        поэтому фикстура для тестов ниже по циклу (submit/accept/return) должна
        сама выполнять оба условия, а не полагаться на старое поведение."""
        req = self._create_request()
        bid = Bid.objects.create(
            request=req, contractor=self.contractor, price=100000, deadline_days=10,
            considered_at=timezone.now(),
        )
        Request.objects.filter(pk=req.pk).update(status=RequestStatus.UNDER_REVIEW)
        req.refresh_from_db()
        return req, bid

    def test_award(self):
        req, bid = self._setup_bid()
        r = self.client_c.post(f"/api/marketplace/requests/{req.id}/award/", {"bid_id": bid.id}, format="json")
        self.assertEqual(r.status_code, 200)
        req.refresh_from_db()
        self.assertEqual(req.status, RequestStatus.AWARDED)
        self.assertEqual(req.assigned_contractor, self.contractor)
        bid.refresh_from_db()
        self.assertEqual(bid.status, BidStatus.SELECTED)

    def test_contractor_cannot_award(self):
        req, bid = self._setup_bid()
        r = self.client_e.post(f"/api/marketplace/requests/{req.id}/award/", {"bid_id": bid.id}, format="json")
        self.assertEqual(r.status_code, 403)

    def test_submit_result(self):
        req, bid = self._setup_bid()
        self.client_c.post(f"/api/marketplace/requests/{req.id}/award/", {"bid_id": bid.id}, format="json")
        file = SimpleUploadedFile("report.pdf", b"fake pdf content", content_type="application/pdf")
        r = self.client_e.post(f"/api/marketplace/requests/{req.id}/submit-result/", {
            "result_files": file,
            "result_note": "Отчёт прикреплён",
        })
        self.assertEqual(r.status_code, 200)
        req.refresh_from_db()
        self.assertEqual(req.status, RequestStatus.RESULT_SUBMITTED)

    def test_submit_result_first_submission_requires_file(self):
        req, bid = self._setup_bid()
        self.client_c.post(f"/api/marketplace/requests/{req.id}/award/", {"bid_id": bid.id}, format="json")
        r = self.client_e.post(f"/api/marketplace/requests/{req.id}/submit-result/", {
            "result_note": "Без файла"
        }, format="json")
        self.assertEqual(r.status_code, 400)

    def test_resubmit_without_return_appends_to_same_entry(self):
        """Досдача БЕЗ промежуточного возврата (забыл файл, заказчик ещё не отреагировал) —
        не создаёт второе submit-событие, добавляет файлы к уже открытому. Комментарий
        второй сдачи ДОПИСЫВАЕТСЯ (не заменяет и не игнорируется). Пара с
        test_full_cycle_creates_four_entries_in_order, где return МЕЖДУ сдачами даёт 2
        отдельных submit-события — контраст показывает, что рвёт серию именно return."""
        req, bid = self._setup_bid()
        self.client_c.post(f"/api/marketplace/requests/{req.id}/award/", {"bid_id": bid.id}, format="json")

        file1 = SimpleUploadedFile("report1.pdf", b"first", content_type="application/pdf")
        r = self.client_e.post(f"/api/marketplace/requests/{req.id}/submit-result/", {
            "result_files": file1, "result_note": "Отчёт готов",
        })
        self.assertEqual(r.status_code, 200)
        req.refresh_from_db()
        self.assertEqual(req.status, RequestStatus.RESULT_SUBMITTED)

        file2 = SimpleUploadedFile("report_addendum.pdf", b"second", content_type="application/pdf")
        r = self.client_e.post(f"/api/marketplace/requests/{req.id}/submit-result/", {
            "result_files": file2, "result_note": "Забыл приложить координаты",
        })
        self.assertEqual(r.status_code, 200)
        req.refresh_from_db()
        self.assertEqual(req.status, RequestStatus.RESULT_SUBMITTED)

        entries = list(req.result_entries.all())
        self.assertEqual(len(entries), 1)
        entry = entries[0]
        self.assertEqual(entry.kind, ResultEntryKind.SUBMITTED)
        self.assertEqual(entry.text, "Отчёт готов\n\nЗабыл приложить координаты")
        self.assertEqual(
            sorted(entry.files.values_list("original_name", flat=True)),
            ["report1.pdf", "report_addendum.pdf"],
        )

    def test_customer_cannot_submit_result(self):
        req, bid = self._setup_bid()
        self.client_c.post(f"/api/marketplace/requests/{req.id}/award/", {"bid_id": bid.id}, format="json")
        r = self.client_c.post(f"/api/marketplace/requests/{req.id}/submit-result/", {}, format="json")
        self.assertEqual(r.status_code, 403)

    def test_accept(self):
        req, bid = self._setup_bid()
        self.client_c.post(f"/api/marketplace/requests/{req.id}/award/", {"bid_id": bid.id}, format="json")
        file = SimpleUploadedFile("report.pdf", b"fake pdf content", content_type="application/pdf")
        self.client_e.post(f"/api/marketplace/requests/{req.id}/submit-result/", {"result_files": file})
        r = self.client_c.post(f"/api/marketplace/requests/{req.id}/accept/")
        self.assertEqual(r.status_code, 200)
        req.refresh_from_db()
        self.assertEqual(req.status, RequestStatus.ACCEPTED)

    def test_contractor_cannot_accept(self):
        req, bid = self._setup_bid()
        self.client_c.post(f"/api/marketplace/requests/{req.id}/award/", {"bid_id": bid.id}, format="json")
        file = SimpleUploadedFile("report.pdf", b"fake pdf content", content_type="application/pdf")
        self.client_e.post(f"/api/marketplace/requests/{req.id}/submit-result/", {"result_files": file})
        r = self.client_e.post(f"/api/marketplace/requests/{req.id}/accept/")
        self.assertEqual(r.status_code, 403)

    def test_return(self):
        req, bid = self._setup_bid()
        self.client_c.post(f"/api/marketplace/requests/{req.id}/award/", {"bid_id": bid.id}, format="json")
        file = SimpleUploadedFile("report.pdf", b"fake pdf content", content_type="application/pdf")
        self.client_e.post(f"/api/marketplace/requests/{req.id}/submit-result/", {"result_files": file})
        r = self.client_c.post(f"/api/marketplace/requests/{req.id}/return/", {"return_note": "Не хватает координат углов"}, format="json")
        self.assertEqual(r.status_code, 200)
        req.refresh_from_db()
        self.assertEqual(req.status, RequestStatus.AWARDED)
        # return_note больше не пишется в Request (поле заморожено, удаляется в подшаге 3) —
        # причина возврата теперь живёт в ResultEntry.
        entry = req.result_entries.get(kind=ResultEntryKind.RETURNED)
        self.assertEqual(entry.text, "Не хватает координат углов")
        self.assertEqual(entry.author, self.customer)

    def test_return_requires_note(self):
        """Возврат без причины бессмыслен — исполнитель сдаст то же самое повторно
        (согласовано 2026-07-14). Пустая строка и строка из пробелов — тоже отказ."""
        req, bid = self._setup_bid()
        self.client_c.post(f"/api/marketplace/requests/{req.id}/award/", {"bid_id": bid.id}, format="json")
        file = SimpleUploadedFile("report.pdf", b"fake pdf content", content_type="application/pdf")
        self.client_e.post(f"/api/marketplace/requests/{req.id}/submit-result/", {"result_files": file})

        r = self.client_c.post(f"/api/marketplace/requests/{req.id}/return/", {}, format="json")
        self.assertEqual(r.status_code, 400)
        r = self.client_c.post(f"/api/marketplace/requests/{req.id}/return/", {"return_note": "   "}, format="json")
        self.assertEqual(r.status_code, 400)
        req.refresh_from_db()
        self.assertEqual(req.status, RequestStatus.RESULT_SUBMITTED)
        self.assertEqual(req.return_note, "")
        # Ни одна из двух неудачных попыток не должна была создать ResultEntry —
        # проверка text обязана стоять ДО .create(), не после.
        self.assertFalse(req.result_entries.filter(kind=ResultEntryKind.RETURNED).exists())

    def test_return_rejected_when_accepted(self):
        """Из accepted (терминальный статус) вернуть нельзя — тот же фильтр
        status=RESULT_SUBMITTED, что уже закрывает return от awarded/open."""
        req, bid = self._setup_bid()
        self.client_c.post(f"/api/marketplace/requests/{req.id}/award/", {"bid_id": bid.id}, format="json")
        file = SimpleUploadedFile("report.pdf", b"fake pdf content", content_type="application/pdf")
        self.client_e.post(f"/api/marketplace/requests/{req.id}/submit-result/", {"result_files": file})
        self.client_c.post(f"/api/marketplace/requests/{req.id}/accept/")
        r = self.client_c.post(f"/api/marketplace/requests/{req.id}/return/", {"return_note": "Поздно"}, format="json")
        self.assertEqual(r.status_code, 404)
        req.refresh_from_db()
        self.assertEqual(req.status, RequestStatus.ACCEPTED)

    def test_accept_rejected_when_awarded(self):
        """Принять нельзя, пока результат не сдан (result_files ещё пуст)."""
        req, bid = self._setup_bid()
        self.client_c.post(f"/api/marketplace/requests/{req.id}/award/", {"bid_id": bid.id}, format="json")
        r = self.client_c.post(f"/api/marketplace/requests/{req.id}/accept/")
        self.assertEqual(r.status_code, 404)
        req.refresh_from_db()
        self.assertEqual(req.status, RequestStatus.AWARDED)

    def test_return_note_visible_to_winner_not_to_loser(self):
        """Та же гарантия инварианта №9, что уже проверена для status/result_files/
        result_note (см. test_winner_sees_status_result_files_and_note /
        test_rejected_contractor_sees_own_bid_not_request_status) — result_entries
        раскрывается по тому же условию (assigned_contractor_id == viewer.id),
        добавлена в ту же ветку, поэтому проигравший её тоже не должен получить.
        return_note (поле Request) больше не пишется — причина живёт в result_entries."""
        req = self._create_request()
        winner_bid = Bid.objects.create(
            request=req, contractor=self.contractor, price=100000, deadline_days=10,
            considered_at=timezone.now(),
        )
        loser = make_contractor("loser-return@test.kz")
        Bid.objects.create(
            request=req, contractor=loser, price=95000, deadline_days=9, considered_at=timezone.now(),
        )
        Request.objects.filter(pk=req.pk).update(status=RequestStatus.UNDER_REVIEW)
        self.client_c.post(f"/api/marketplace/requests/{req.id}/award/", {"bid_id": winner_bid.id}, format="json")
        file = SimpleUploadedFile("report.pdf", b"fake pdf content", content_type="application/pdf")
        self.client_e.post(f"/api/marketplace/requests/{req.id}/submit-result/", {"result_files": file})
        self.client_c.post(f"/api/marketplace/requests/{req.id}/return/", {"return_note": "Добавьте профиль скважины"}, format="json")

        r_winner = self.client_e.get(f"/api/marketplace/requests/{req.id}/")
        returned_entries = [e for e in r_winner.data["result_entries"] if e["kind"] == "returned"]
        self.assertEqual(len(returned_entries), 1)
        self.assertEqual(returned_entries[0]["text"], "Добавьте профиль скважины")

        loser_client = APIClient()
        loser_client.force_authenticate(user=loser)
        r_loser = loser_client.get(f"/api/marketplace/requests/{req.id}/")
        self.assertNotIn("result_entries", r_loser.data)
        self.assertNotIn("return_note", r_loser.data)
        self.assertIn("my_bid", r_loser.data)

    @patch("apps.marketplace.views.publish")
    def test_return_publishes_event_with_note(self, mock_publish):
        req, bid = self._setup_bid()
        self.client_c.post(f"/api/marketplace/requests/{req.id}/award/", {"bid_id": bid.id}, format="json")
        file = SimpleUploadedFile("report.pdf", b"fake pdf content", content_type="application/pdf")
        self.client_e.post(f"/api/marketplace/requests/{req.id}/submit-result/", {"result_files": file})
        mock_publish.reset_mock()
        self.client_c.post(f"/api/marketplace/requests/{req.id}/return/", {"return_note": "Причина X"}, format="json")
        self.assertEqual(mock_publish.call_count, 1)
        published = mock_publish.call_args[0][0]
        self.assertIsInstance(published, ResultReturned)
        self.assertEqual(published.return_note, "Причина X")

    def test_full_cycle_creates_four_entries_in_order(self):
        """Полный цикл submit → return → submit → accept создаёт РОВНО 4 ResultEntry
        в правильном порядке (submitted, returned, submitted, accepted) — включая
        AcceptView, который тоже создаёт запись (text=""), иначе цикл давал бы только
        3 события. Файлы каждой сдачи привязаны к СВОЕМУ событию, не перемешаны —
        то, ради чего вообще заводили ResultFile.event (заявка #38, найдено 2026-07-17:
        два файла с интервалом 51 секунда, один синтетический submit склеил бы их
        неверно). author — соответствующая роль (kind это гарантирует структурно, не
        сравнением с assigned_contractor)."""
        req, bid = self._setup_bid()
        self.client_c.post(f"/api/marketplace/requests/{req.id}/award/", {"bid_id": bid.id}, format="json")

        file1 = SimpleUploadedFile("report1.pdf", b"first", content_type="application/pdf")
        r = self.client_e.post(f"/api/marketplace/requests/{req.id}/submit-result/", {"result_files": file1})
        self.assertEqual(r.status_code, 200)

        r = self.client_c.post(f"/api/marketplace/requests/{req.id}/return/", {"return_note": "Причина 1"}, format="json")
        self.assertEqual(r.status_code, 200)
        req.refresh_from_db()
        self.assertEqual(req.status, RequestStatus.AWARDED)

        file2 = SimpleUploadedFile("report2.pdf", b"second", content_type="application/pdf")
        r = self.client_e.post(f"/api/marketplace/requests/{req.id}/submit-result/", {"result_files": file2})
        self.assertEqual(r.status_code, 200)
        req.refresh_from_db()
        self.assertEqual(req.status, RequestStatus.RESULT_SUBMITTED)

        r = self.client_c.post(f"/api/marketplace/requests/{req.id}/accept/")
        self.assertEqual(r.status_code, 200)
        req.refresh_from_db()
        self.assertEqual(req.status, RequestStatus.ACCEPTED)

        entries = list(req.result_entries.all())  # Meta.ordering = created_at
        self.assertEqual(len(entries), 4)
        self.assertEqual(
            [e.kind for e in entries],
            [ResultEntryKind.SUBMITTED, ResultEntryKind.RETURNED, ResultEntryKind.SUBMITTED, ResultEntryKind.ACCEPTED],
        )
        submit1, returned, submit2, accepted = entries
        self.assertEqual(submit1.author, self.contractor)
        self.assertEqual(returned.author, self.customer)
        self.assertEqual(returned.text, "Причина 1")
        self.assertEqual(submit2.author, self.contractor)
        self.assertEqual(accepted.author, self.customer)
        self.assertEqual(accepted.text, "")

        # Файлы каждой сдачи — у СВОЕГО события, не перемешаны.
        self.assertEqual(list(submit1.files.values_list("original_name", flat=True)), ["report1.pdf"])
        self.assertEqual(list(submit2.files.values_list("original_name", flat=True)), ["report2.pdf"])

    # ------------------------------------------------------------------
    # Мои отклики (исполнитель)
    # ------------------------------------------------------------------
    def test_my_bids(self):
        req = self._create_request()
        Bid.objects.create(request=req, contractor=self.contractor, price=100000, deadline_days=10)
        r = self.client_e.get("/api/marketplace/my-bids/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data), 1)


class BidRatingAggregationTests(TestCase):
    """Этап 3 блока «Репутация» — агрегат рейтинга в карточке отклика
    (GET .../bids/, BidListCreateView.list() + ContractorBriefSerializer.rating).
    Отзывы берутся с ОТДЕЛЬНЫХ закрытых заявок того же исполнителя — не
    self.request_obj (она сама ещё pending, отзыва на неё нет и быть не может,
    инвариант №1/№8)."""

    def setUp(self):
        self.customer = make_customer()
        self.contractor = make_contractor()
        self.site = make_site(self.customer)
        self.city = make_city()
        self.client_c = APIClient()
        self.client_c.force_authenticate(self.customer)
        self.request_obj = Request.objects.create(
            site=self.site, customer=self.customer, work_type="geodesy",
            description="x", location_type=LocationType.CITY, city=self.city,
        )
        Bid.objects.create(request=self.request_obj, contractor=self.contractor, price=100000, deadline_days=10)

    def _bids_url(self):
        return f"/api/marketplace/requests/{self.request_obj.id}/bids/"

    def _leave_review(self, contractor, rating):
        """Отдельная закрытая (accepted) заявка того же исполнителя —
        источник отзыва для агрегата."""
        site = make_site(self.customer)
        req = Request.objects.create(
            site=site, customer=self.customer, work_type="geodesy",
            description="x", location_type=LocationType.CITY, city=self.city,
            status=RequestStatus.ACCEPTED, assigned_contractor=contractor,
        )
        return Review.objects.create(request=req, contractor=contractor, rating=rating)

    def test_rating_is_null_when_no_reviews(self):
        r = self.client_c.get(self._bids_url())
        self.assertEqual(r.status_code, 200)
        self.assertIsNone(r.data[0]["contractor"]["rating"])

    def test_rating_average_and_count(self):
        self._leave_review(self.contractor, 5)
        self._leave_review(self.contractor, 4)
        self._leave_review(self.contractor, 3)
        r = self.client_c.get(self._bids_url())
        rating = r.data[0]["contractor"]["rating"]
        self.assertEqual(rating["avg"], 4.0)
        self.assertEqual(rating["count"], 3)

    def test_rating_rounds_to_one_decimal(self):
        self._leave_review(self.contractor, 5)
        self._leave_review(self.contractor, 5)
        self._leave_review(self.contractor, 4)
        r = self.client_c.get(self._bids_url())
        self.assertEqual(r.data[0]["contractor"]["rating"]["avg"], 4.7)

    def test_rating_avg_serializes_as_number_not_string(self):
        """Avg() на PostgreSQL может вернуть Decimal — DRF JSONEncoder
        сериализует Decimal как СТРОКУ, не число, если явно не привести к
        float (см. reputation/services.py). Проверяем на сырых байтах ответа
        (r.content), не через r.data — DRF Response.data содержит уже
        Python-объекты ДО рендеринга в JSON, там это различие не видно."""
        self._leave_review(self.contractor, 5)
        r = self.client_c.get(self._bids_url())
        raw = r.content.decode()
        self.assertIn('"avg":5.0', raw.replace(" ", ""))

    def test_ratings_do_not_mix_between_contractors(self):
        other = make_contractor(email="other-contractor@test.kz")
        Bid.objects.create(request=self.request_obj, contractor=other, price=90000, deadline_days=8)
        self._leave_review(self.contractor, 5)
        self._leave_review(other, 1)
        r = self.client_c.get(self._bids_url())
        by_contractor = {b["contractor"]["id"]: b["contractor"]["rating"] for b in r.data}
        self.assertEqual(by_contractor[self.contractor.id]["avg"], 5.0)
        self.assertEqual(by_contractor[other.id]["avg"], 1.0)

    def test_rating_lookup_does_not_n_plus_one(self):
        """По образцу test_my_bids_location_display_does_not_n_plus_one —
        число запросов на 1 отклик и на 4 (разные исполнители, у каждого
        свой отзыв) не должно расти: get_ratings_for_contractors — один
        агрегатный запрос на весь список id, не по одному на исполнителя."""
        with CaptureQueriesContext(connection) as ctx_one:
            r = self.client_c.get(self._bids_url())
        self.assertEqual(r.status_code, 200)
        queries_for_one = len(ctx_one.captured_queries)

        for i in range(3):
            c = make_contractor(email=f"rated-{i}@test.kz")
            Bid.objects.create(request=self.request_obj, contractor=c, price=90000, deadline_days=8)
            self._leave_review(c, 5)
        self._leave_review(self.contractor, 5)

        with CaptureQueriesContext(connection) as ctx_four:
            r = self.client_c.get(self._bids_url())
        self.assertEqual(r.status_code, 200)
        queries_for_four = len(ctx_four.captured_queries)

        self.assertEqual(
            queries_for_one, queries_for_four,
            f"Запросы растут с числом откликов: {queries_for_one} на 1, "
            f"{queries_for_four} на 4 — рейтинг делает запрос на каждый отклик.",
        )
