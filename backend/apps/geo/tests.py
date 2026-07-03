from __future__ import annotations

from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import Role, User

from .models import City, District, Region


class GeoLocationsViewTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="geo-user@test.kz", password="pass", role=Role.CONTRACTOR,
            person_type="individual", full_name="Тест", phone="700",
        )
        self.region = Region.objects.create(name="Тестовая область")
        self.district = District.objects.create(region=self.region, name="Тестовый район")
        self.region_city = City.objects.create(region=self.region, name="Областной город")
        self.republican_city = City.objects.create(region=None, name="Алматы")

    def test_requires_authentication(self):
        r = APIClient().get("/api/geo/locations/")
        self.assertEqual(r.status_code, 401)

    def test_returns_republican_cities_and_region_tree(self):
        client = APIClient()
        client.force_authenticate(self.user)
        r = client.get("/api/geo/locations/")
        self.assertEqual(r.status_code, 200)

        republican_names = [c["name"] for c in r.data["republican_cities"]]
        self.assertIn("Алматы", republican_names)

        region_data = next(reg for reg in r.data["regions"] if reg["name"] == "Тестовая область")
        self.assertEqual([c["name"] for c in region_data["cities"]], ["Областной город"])
        self.assertEqual([d["name"] for d in region_data["districts"]], ["Тестовый район"])
