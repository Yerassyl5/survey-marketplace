"""Этап 1 блока «Репутация» — только модели (Review/ReviewTag), без view/API.
Гейт «только после accepted» и сериализация — этап 2, здесь не тестируются."""
from __future__ import annotations

from django.contrib.gis.geos import Point
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models import ProtectedError
from django.test import TestCase

from apps.accounts.models import ContractorProfile, Role, User, VerificationStatus
from apps.marketplace.models import Request, RequestStatus
from apps.sites.models import Site

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
