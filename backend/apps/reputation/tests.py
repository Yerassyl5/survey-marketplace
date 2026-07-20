"""Этап 1 блока «Репутация» — только модели (Review/ReviewTag), без view/API.
Гейт «только после accepted» и сериализация — этап 2, здесь не тестируются."""
from __future__ import annotations

from unittest.mock import patch

from django.contrib.gis.geos import Point
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models import ProtectedError
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import ContractorProfile, Role, User, VerificationStatus
from apps.marketplace.models import Request, RequestStatus
from apps.sites.models import Site

from .events import ReviewLeft
from .models import Review, ReviewTag


def make_customer(email="customer@test.kz"):
    return User.objects.create_user(
        email=email, password="pass", role=Role.CUSTOMER,
        person_type="individual", full_name="Заказчик Тест", phone="700",
    )


def make_contractor(email="contractor@test.kz"):
    user = User.objects.create_user(
        email=email, password="pass", role=Role.CONTRACTOR,
        person_type="individual", full_name="Исполнитель Тест", phone="701",
    )
    ContractorProfile.objects.create(user=user, verification_status=VerificationStatus.VERIFIED)
    return user


def make_accepted_request(customer, contractor):
    site = Site.objects.create(owner=customer, geometry=Point(76.9, 43.2))
    return Request.objects.create(
        site=site, customer=customer, work_type="geodesy", description="x",
        location_type="city", status=RequestStatus.ACCEPTED, assigned_contractor=contractor,
    )


class ReviewModelTests(TestCase):
    def setUp(self):
        self.customer = make_customer()
        self.contractor = make_contractor()
        self.request_obj = make_accepted_request(self.customer, self.contractor)

    def test_valid_review_is_created(self):
        review = Review.objects.create(
            request=self.request_obj, contractor=self.contractor, rating=5, comment="Отлично",
        )
        self.assertEqual(review.rating, 5)
        self.assertEqual(str(review), f"Отзыв на заявку #{self.request_obj.id} — 5★")

    def test_rating_below_minimum_fails_validation(self):
        review = Review(request=self.request_obj, contractor=self.contractor, rating=0)
        with self.assertRaises(ValidationError):
            review.full_clean()

    def test_rating_above_maximum_fails_validation(self):
        review = Review(request=self.request_obj, contractor=self.contractor, rating=6)
        with self.assertRaises(ValidationError):
            review.full_clean()

    def test_second_review_on_same_request_is_rejected(self):
        """OneToOneField(request) — один отзыв на заявку, без отдельного unique_together."""
        Review.objects.create(request=self.request_obj, contractor=self.contractor, rating=4)
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Review.objects.create(request=self.request_obj, contractor=self.contractor, rating=2)

    def test_review_deleted_when_request_deleted(self):
        """on_delete=CASCADE на request — согласовано с PRODUCT_SPEC 1.4/1.7
        («администратор может удалить любую заявку», безусловно)."""
        review = Review.objects.create(request=self.request_obj, contractor=self.contractor, rating=5)
        review_id = review.id
        self.request_obj.delete()
        self.assertFalse(Review.objects.filter(id=review_id).exists())

    def test_review_blocks_contractor_deletion(self):
        """on_delete=PROTECT на contractor — отзыв не должен исчезать молча
        при удалении аккаунта исполнителя (решение №1: отзыв постоянный).
        ProtectedError, не голый IntegrityError — тот наследует IntegrityError,
        так что assertRaises(IntegrityError) прошёл бы и на любом другом
        нарушении целостности, не только на PROTECT."""
        Review.objects.create(request=self.request_obj, contractor=self.contractor, rating=5)
        with self.assertRaises(ProtectedError):
            with transaction.atomic():
                self.contractor.delete()

    def test_tags_attach_to_review(self):
        tag = ReviewTag.objects.create(name="Тестовый тег")
        review = Review.objects.create(request=self.request_obj, contractor=self.contractor, rating=5)
        review.tags.add(tag)
        self.assertIn(tag, review.tags.all())


class ReviewTagModelTests(TestCase):
    def test_str_returns_name(self):
        # Имя намеренно НЕ из сида (0002_seed_review_tags) — иначе коллизия
        # уникальности с уже засеянной строкой в тестовой БД.
        tag = ReviewTag.objects.create(name="Тег для теста __str__")
        self.assertEqual(str(tag), "Тег для теста __str__")

    def test_name_is_unique(self):
        ReviewTag.objects.create(name="Уникальный тег")
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                ReviewTag.objects.create(name="Уникальный тег")


class SeedMigrationTests(TestCase):
    """Не проверяем точное количество (ReviewTag.objects.count()) — админ
    добавит тег через ReviewTagAdmin, и тест упал бы на ровном месте.
    Проверяем только, что засеянные имена присутствуют."""

    EXPECTED_SEEDED_NAMES = [
        "Соблюдает сроки",
        "Качественная работа",
        "Чёткая коммуникация",
        "Аккуратная документация",
        "Оперативно на связи",
        "Выехал на объект вовремя",
    ]

    def test_seeded_tags_present(self):
        existing_names = set(ReviewTag.objects.values_list("name", flat=True))
        for name in self.EXPECTED_SEEDED_NAMES:
            self.assertIn(name, existing_names)


def make_open_request(customer):
    """Заявка НЕ в accepted — для проверки гейта статуса на POST."""
    site = Site.objects.create(owner=customer, geometry=Point(76.9, 43.2))
    return Request.objects.create(
        site=site, customer=customer, work_type="geodesy", description="x",
        location_type="city", status=RequestStatus.AWARDED,
    )


class ReviewAPITests(TestCase):
    """Этап 2 — эндпоинты создания/чтения. GET публичен любому залогиненному
    (PRODUCT_SPEC 1.10, инвариант №9 новой редакции), POST — только
    заказчик-владелец на accepted-заявке (инварианты №1/№8)."""

    def setUp(self):
        self.customer = make_customer()
        self.other_customer = make_customer(email="other-customer@test.kz")
        self.contractor = make_contractor()
        self.stranger_contractor = make_contractor(email="stranger@test.kz")
        self.request_obj = make_accepted_request(self.customer, self.contractor)
        self.client_c = APIClient()
        self.client_other_c = APIClient()
        self.client_e = APIClient()
        self.client_c.force_authenticate(self.customer)
        self.client_other_c.force_authenticate(self.other_customer)
        self.client_e.force_authenticate(self.contractor)

    def _url(self, request_id=None):
        return f"/api/reputation/requests/{request_id or self.request_obj.id}/review/"

    # ------------------------------------------------------------------
    # GET — публичность
    # ------------------------------------------------------------------
    def test_get_returns_404_when_review_does_not_exist(self):
        r = self.client_c.get(self._url())
        self.assertEqual(r.status_code, 404)

    def test_get_visible_to_owner(self):
        Review.objects.create(request=self.request_obj, contractor=self.contractor, rating=5)
        r = self.client_c.get(self._url())
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["rating"], 5)

    def test_get_visible_to_unrelated_authenticated_contractor(self):
        """Отзыв публичен — посторонний исполнитель, не участвовавший в
        сделке, видит его так же, как владелец. НЕ 404."""
        Review.objects.create(request=self.request_obj, contractor=self.contractor, rating=4)
        stranger_client = APIClient()
        stranger_client.force_authenticate(self.stranger_contractor)
        r = stranger_client.get(self._url())
        self.assertEqual(r.status_code, 200)

    def test_get_requires_authentication(self):
        Review.objects.create(request=self.request_obj, contractor=self.contractor, rating=3)
        r = APIClient().get(self._url())
        self.assertEqual(r.status_code, 401)

    # ------------------------------------------------------------------
    # POST — создание
    # ------------------------------------------------------------------
    def test_owner_creates_review_on_accepted_request(self):
        r = self.client_c.post(self._url(), {"rating": 5, "comment": "Отлично"}, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertTrue(Review.objects.filter(request=self.request_obj).exists())

    def test_create_rejected_when_request_not_accepted(self):
        req = make_open_request(self.customer)
        r = self.client_c.post(self._url(req.id), {"rating": 5}, format="json")
        self.assertEqual(r.status_code, 404)

    def test_create_rejected_for_non_owner_customer(self):
        r = self.client_other_c.post(self._url(), {"rating": 5}, format="json")
        self.assertEqual(r.status_code, 404)

    def test_duplicate_review_returns_409(self):
        Review.objects.create(request=self.request_obj, contractor=self.contractor, rating=5)
        r = self.client_c.post(self._url(), {"rating": 4}, format="json")
        self.assertEqual(r.status_code, 409)

    def test_create_rejected_when_contractor_unavailable(self):
        """Request.assigned_contractor — SET_NULL: если аккаунт исполнителя
        удалён после accepted, поле обнуляется, а Review.contractor не
        nullable — эндпоинт должен вернуть внятный 409, не 500."""
        self.contractor.delete()
        self.request_obj.refresh_from_db()
        self.assertIsNone(self.request_obj.assigned_contractor_id)
        r = self.client_c.post(self._url(), {"rating": 5}, format="json")
        self.assertEqual(r.status_code, 409)
        self.assertIn("недоступен", r.data["detail"])

    def test_create_by_contractor_returns_403(self):
        """Совпадает с существующим прецедентом marketplace
        (test_contractor_cannot_create_request) — IsCustomer отклоняет
        авторизованного пользователя другой роли 403-м, не 404."""
        r = self.client_e.post(self._url(), {"rating": 5}, format="json")
        self.assertEqual(r.status_code, 403)

    def test_create_anon_returns_401(self):
        r = APIClient().post(self._url(), {"rating": 5}, format="json")
        self.assertEqual(r.status_code, 401)

    def test_rating_out_of_range_rejected(self):
        r = self.client_c.post(self._url(), {"rating": 6}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_comment_over_2000_chars_rejected(self):
        r = self.client_c.post(self._url(), {"rating": 5, "comment": "x" * 2001}, format="json")
        self.assertEqual(r.status_code, 400)

    @patch("apps.reputation.views.publish")
    def test_review_left_published_once(self, mock_publish):
        r = self.client_c.post(self._url(), {"rating": 5}, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(mock_publish.call_count, 1)
        published = mock_publish.call_args[0][0]
        self.assertIsInstance(published, ReviewLeft)
        self.assertEqual(published.request_id, self.request_obj.id)
        self.assertEqual(published.contractor_id, self.contractor.id)
        self.assertEqual(published.rating, 5)
