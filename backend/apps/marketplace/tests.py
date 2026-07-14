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
from apps.sites.models import Site

from .events import BidConsidered
from .models import Bid, BidStatus, LocationType, Request, RequestStatus


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
        r = self.client_c.post(f"/api/marketplace/requests/{req.id}/return/")
        self.assertEqual(r.status_code, 200)
        req.refresh_from_db()
        self.assertEqual(req.status, RequestStatus.AWARDED)

    # ------------------------------------------------------------------
    # Мои отклики (исполнитель)
    # ------------------------------------------------------------------
    def test_my_bids(self):
        req = self._create_request()
        Bid.objects.create(request=req, contractor=self.contractor, price=100000, deadline_days=10)
        r = self.client_e.get("/api/marketplace/my-bids/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data), 1)
