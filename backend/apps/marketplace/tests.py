"""Смок-тест полного цикла 1.4: заявка → отклик → выбор → сдача → принятие."""
from __future__ import annotations

from django.contrib.gis.geos import Point
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import ContractorProfile, Role, User, VerificationStatus
from apps.sites.models import Site

from .models import BidStatus, Request, RequestStatus


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
    return Site.objects.create(owner=owner, address="г. Алматы", geometry=Point(76.9, 43.2))


class RequestLifecycleTest(TestCase):
    def setUp(self):
        self.customer = make_customer()
        self.contractor = make_contractor()
        self.site = make_site(self.customer)
        self.client_c = APIClient()   # клиент заказчика
        self.client_e = APIClient()   # клиент исполнителя
        self.client_c.force_authenticate(self.customer)
        self.client_e.force_authenticate(self.contractor)

    # ------------------------------------------------------------------
    # Создание заявки
    # ------------------------------------------------------------------
    def test_customer_creates_request(self):
        r = self.client_c.post("/api/marketplace/requests/", {
            "site": self.site.id,
            "work_type": "geodesy",
            "description": "Топосъёмка участка",
            "city": "Алматы",
        }, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.data["status"], RequestStatus.OPEN)

    def test_contractor_cannot_create_request(self):
        r = self.client_e.post("/api/marketplace/requests/", {
            "site": self.site.id, "work_type": "geodesy",
            "description": "x", "city": "Алматы",
        }, format="json")
        self.assertEqual(r.status_code, 403)

    def test_anon_cannot_create_request(self):
        r = APIClient().post("/api/marketplace/requests/", {
            "site": self.site.id, "work_type": "geodesy",
            "description": "x", "city": "Алматы",
        }, format="json")
        self.assertEqual(r.status_code, 401)

    # ------------------------------------------------------------------
    # Лента и доступ к заявке
    # ------------------------------------------------------------------
    def _create_request(self):
        req = Request.objects.create(
            site=self.site, customer=self.customer,
            work_type="geodesy", description="x", city="Алматы",
        )
        return req

    def test_contractor_sees_open_feed(self):
        self._create_request()
        r = self.client_e.get("/api/marketplace/requests/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data), 1)

    def test_customer_sees_own_requests_only(self):
        self._create_request()
        other_customer = make_customer("other@test.kz")
        client2 = APIClient()
        client2.force_authenticate(other_customer)
        r = client2.get("/api/marketplace/requests/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data), 0)

    def test_contractor_cannot_see_customers_request_detail_if_not_open(self):
        req = self._create_request()
        req.status = RequestStatus.AWARDED
        req.assigned_contractor = make_contractor("other2@test.kz")
        req.save()
        r = self.client_e.get(f"/api/marketplace/requests/{req.id}/")
        self.assertEqual(r.status_code, 404)

    # ------------------------------------------------------------------
    # Отклик (мягкий вариант — неверифицированный пропускается)
    # ------------------------------------------------------------------
    def test_unverified_contractor_can_bid(self):
        req = self._create_request()
        r = self.client_e.post(f"/api/marketplace/requests/{req.id}/bids/", {
            "comment": "Готов выполнить"
        }, format="json")
        self.assertEqual(r.status_code, 201)

    def test_verification_status_visible_in_bid(self):
        req = self._create_request()
        self.client_e.post(f"/api/marketplace/requests/{req.id}/bids/", {}, format="json")
        r = self.client_c.get(f"/api/marketplace/requests/{req.id}/bids/")
        self.assertEqual(r.status_code, 200)
        self.assertIn("verification_status", r.data[0]["contractor"])
        self.assertEqual(r.data[0]["contractor"]["verification_status"], VerificationStatus.PENDING)

    def test_duplicate_bid_rejected(self):
        req = self._create_request()
        self.client_e.post(f"/api/marketplace/requests/{req.id}/bids/", {}, format="json")
        r = self.client_e.post(f"/api/marketplace/requests/{req.id}/bids/", {}, format="json")
        self.assertIn(r.status_code, [400, 409])

    def test_customer_cannot_bid(self):
        req = self._create_request()
        r = self.client_c.post(f"/api/marketplace/requests/{req.id}/bids/", {}, format="json")
        self.assertEqual(r.status_code, 403)

    def test_contractor_cannot_list_bids(self):
        req = self._create_request()
        r = self.client_e.get(f"/api/marketplace/requests/{req.id}/bids/")
        self.assertEqual(r.status_code, 403)

    # ------------------------------------------------------------------
    # Полный цикл: award → submit → accept
    # ------------------------------------------------------------------
    def _setup_bid(self):
        req = self._create_request()
        from .models import Bid
        bid = Bid.objects.create(request=req, contractor=self.contractor)
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
        r = self.client_e.post(f"/api/marketplace/requests/{req.id}/submit-result/", {
            "result_note": "Отчёт прикреплён"
        }, format="json")
        self.assertEqual(r.status_code, 200)
        req.refresh_from_db()
        self.assertEqual(req.status, RequestStatus.RESULT_SUBMITTED)

    def test_customer_cannot_submit_result(self):
        req, bid = self._setup_bid()
        self.client_c.post(f"/api/marketplace/requests/{req.id}/award/", {"bid_id": bid.id}, format="json")
        r = self.client_c.post(f"/api/marketplace/requests/{req.id}/submit-result/", {}, format="json")
        self.assertEqual(r.status_code, 403)

    def test_accept(self):
        req, bid = self._setup_bid()
        self.client_c.post(f"/api/marketplace/requests/{req.id}/award/", {"bid_id": bid.id}, format="json")
        self.client_e.post(f"/api/marketplace/requests/{req.id}/submit-result/", {}, format="json")
        r = self.client_c.post(f"/api/marketplace/requests/{req.id}/accept/")
        self.assertEqual(r.status_code, 200)
        req.refresh_from_db()
        self.assertEqual(req.status, RequestStatus.ACCEPTED)

    def test_contractor_cannot_accept(self):
        req, bid = self._setup_bid()
        self.client_c.post(f"/api/marketplace/requests/{req.id}/award/", {"bid_id": bid.id}, format="json")
        self.client_e.post(f"/api/marketplace/requests/{req.id}/submit-result/", {}, format="json")
        r = self.client_e.post(f"/api/marketplace/requests/{req.id}/accept/")
        self.assertEqual(r.status_code, 403)

    def test_return(self):
        req, bid = self._setup_bid()
        self.client_c.post(f"/api/marketplace/requests/{req.id}/award/", {"bid_id": bid.id}, format="json")
        self.client_e.post(f"/api/marketplace/requests/{req.id}/submit-result/", {}, format="json")
        r = self.client_c.post(f"/api/marketplace/requests/{req.id}/return/")
        self.assertEqual(r.status_code, 200)
        req.refresh_from_db()
        self.assertEqual(req.status, RequestStatus.AWARDED)

    # ------------------------------------------------------------------
    # Мои отклики (исполнитель)
    # ------------------------------------------------------------------
    def test_my_bids(self):
        req = self._create_request()
        from .models import Bid
        Bid.objects.create(request=req, contractor=self.contractor)
        r = self.client_e.get("/api/marketplace/my-bids/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data), 1)
