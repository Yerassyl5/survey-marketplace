from __future__ import annotations

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, TestCase
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.sites.models import Site

from .models import City, District, Region
from .services import parse_geo_file

# Долгая (URN) форма crs-члена — ровно то, что реально пишет GDAL 3.10.3
# (ogr2ogr — тот же движок, что использует QGIS «Save Vector Features As»)
# при экспорте GeoJSON в проекцию, отличную от 4326. Проверено вручную:
# ogr2ogr -t_srs EPSG:32642 полигона из WGS84 (71.446/51.18 … 71.453/51.185,
# район Астаны) даёт именно этот crs-член и эти координаты в метрах (UTM 42N) —
# тот же порядок величин, что у сломанного Site id=16 в dev-БД.
GEOJSON_UTM42N_LONG_CRS = """
{
"type": "FeatureCollection",
"crs": { "type": "name", "properties": { "name": "urn:ogc:def:crs:EPSG::32642" } },
"features": [
{ "type": "Feature", "properties": { }, "geometry": { "type": "Polygon", "coordinates": [ [
  [670958.814641273580492, 5672685.799104944802821],
  [671448.003415261395276, 5672702.103351202793419],
  [671429.447665268555284, 5673258.030852733179927],
  [670940.31188686308451, 5673241.727228184230626],
  [670958.814641273580492, 5672685.799104944802821]
] ] } }
]
}
"""

# Короткая форма записи EPSG в crs-члене — второй реально встречающийся
# вариант (проверено той же ручной проверкой на GDAL 3.10.3).
GEOJSON_UTM42N_SHORT_CRS = """
{"type":"FeatureCollection","crs":{"type":"name","properties":{"name":"EPSG:32642"}},
"features":[{"type":"Feature","properties":{},"geometry":{"type":"Polygon","coordinates":[[
  [670958.814641273580492, 5672685.799104944802821],
  [671448.003415261395276, 5672702.103351202793419],
  [671429.447665268555284, 5673258.030852733179927],
  [670940.31188686308451, 5673241.727228184230626],
  [670958.814641273580492, 5672685.799104944802821]
]]}}]}
"""

# Без crs-члена, координаты в метрах — регресс-фикстура на реальный
# сломанный Site id=16 («УВС2») из dev-БД (см. диагностическую сессию):
# файл без объявленной CRS, GDAL по умолчанию считает WGS84 (RFC 7946), а
# числа физически не могут быть градусами — должно ловиться bbox-проверкой.
GEOJSON_NO_CRS_OUT_OF_RANGE = """
{"type":"Polygon","coordinates":[[
  [703345.1951662692, 5795889.390835862],
  [724063.5086880615, 5801558.062258806],
  [710798.0912650465, 5758036.524391114],
  [703345.1951662692, 5795889.390835862]
]]}
"""

GEOJSON_WGS84_NO_CRS = """
{"type":"Point","coordinates":[71.44,51.18]}
"""

KML_WGS84 = """<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Placemark>
    <Point><coordinates>71.44,51.18,0</coordinates></Point>
  </Placemark>
</kml>
"""


class ParseGeoFileTests(SimpleTestCase):
    """geo/services.py::parse_geo_file — единый GDAL-путь для KML/GeoJSON +
    bbox-валидация WGS84. Регресс на инцидент: GeoJSON из QGIS в проекции,
    отличной от 4326, сохранялся как градусы без репроекции (Site id=16 в
    dev-БД — координаты в метрах, помечены SRID 4326)."""

    @staticmethod
    def _upload(content: str, name: str) -> SimpleUploadedFile:
        return SimpleUploadedFile(name, content.encode("utf-8"))

    def test_geojson_with_long_form_crs_reprojected_to_degrees(self):
        geom, fmt = parse_geo_file(self._upload(GEOJSON_UTM42N_LONG_CRS, "site.geojson"))
        self.assertEqual(fmt, "geojson")
        self.assertEqual(geom.srid, 4326)
        min_x, min_y, max_x, max_y = geom.extent
        # Исходный полигон до репроекции в UTM был 71.446..71.453 / 51.18..51.185.
        self.assertAlmostEqual(min_x, 71.446, places=3)
        self.assertAlmostEqual(max_x, 71.453, places=3)
        self.assertAlmostEqual(min_y, 51.18, places=3)
        self.assertAlmostEqual(max_y, 51.185, places=3)

    def test_geojson_with_short_form_crs_reprojected_to_degrees(self):
        geom, fmt = parse_geo_file(self._upload(GEOJSON_UTM42N_SHORT_CRS, "site.geojson"))
        self.assertEqual(fmt, "geojson")
        min_x, min_y, max_x, max_y = geom.extent
        self.assertTrue(-180 <= min_x <= 180 and -90 <= min_y <= 90)
        self.assertAlmostEqual(min_x, 71.446, places=2)
        self.assertAlmostEqual(min_y, 51.18, places=2)

    def test_geojson_without_crs_out_of_range_rejected(self):
        with self.assertRaises(ValidationError) as cm:
            parse_geo_file(self._upload(GEOJSON_NO_CRS_OUT_OF_RANGE, "site.geojson"))
        self.assertEqual(
            str(cm.exception.detail[0]),
            "Координаты вне допустимого диапазона широты/долготы — похоже, файл "
            "экспортирован не в системе координат WGS84 (EPSG:4326). Проверьте CRS "
            "при экспорте из QGIS.",
        )

    def test_geojson_wgs84_no_crs_still_works(self):
        geom, fmt = parse_geo_file(self._upload(GEOJSON_WGS84_NO_CRS, "site.geojson"))
        self.assertEqual(fmt, "geojson")
        self.assertEqual(geom.srid, 4326)
        self.assertEqual(geom.coords, (71.44, 51.18))

    def test_kml_wgs84_still_works(self):
        geom, fmt = parse_geo_file(self._upload(KML_WGS84, "site.kml"))
        self.assertEqual(fmt, "kml")
        self.assertEqual(geom.srid, 4326)
        self.assertAlmostEqual(geom.x, 71.44, places=5)
        self.assertAlmostEqual(geom.y, 51.18, places=5)


class GeometryParseViewTests(TestCase):
    """POST /api/geo/parse-geometry/ — GeometryParseView: бесстейтовый парсинг
    файла для формы создания заявки, чтобы получить финальную геометрию ДО
    создания Site (устраняет временную точку-заглушку [71.4, 51.1] — см.
    диагностическую сессию про orphan Site). Переиспользует parse_geo_file()
    без изменений — фикстуры общие с ParseGeoFileTests выше."""

    def setUp(self):
        self.user = User.objects.create_user(
            email="geo-parse-user@test.kz", password="pass", role=Role.CUSTOMER,
            person_type="individual", full_name="Тест", phone="700",
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    @staticmethod
    def _upload(content: str, name: str) -> SimpleUploadedFile:
        return SimpleUploadedFile(name, content.encode("utf-8"))

    def test_valid_wgs84_geojson_returns_geometry(self):
        r = self.client.post(
            "/api/geo/parse-geometry/",
            {"file": self._upload(GEOJSON_WGS84_NO_CRS, "site.geojson")},
            format="multipart",
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["format"], "geojson")
        self.assertEqual(r.data["geometry"]["type"], "Point")
        self.assertEqual(tuple(r.data["geometry"]["coordinates"]), (71.44, 51.18))

    def test_geojson_with_crs_returns_reprojected_geometry(self):
        r = self.client.post(
            "/api/geo/parse-geometry/",
            {"file": self._upload(GEOJSON_UTM42N_LONG_CRS, "site.geojson")},
            format="multipart",
        )
        self.assertEqual(r.status_code, 200)
        ring = r.data["geometry"]["coordinates"][0]
        lons = [c[0] for c in ring]
        lats = [c[1] for c in ring]
        self.assertTrue(all(-180 <= lon <= 180 for lon in lons))
        self.assertTrue(all(-90 <= lat <= 90 for lat in lats))
        self.assertAlmostEqual(min(lons), 71.446, places=2)
        self.assertAlmostEqual(min(lats), 51.18, places=2)

    def test_out_of_range_without_crs_rejected_with_readable_detail(self):
        r = self.client.post(
            "/api/geo/parse-geometry/",
            {"file": self._upload(GEOJSON_NO_CRS_OUT_OF_RANGE, "site.geojson")},
            format="multipart",
        )
        self.assertEqual(r.status_code, 400)
        self.assertEqual(
            r.data["detail"],
            "Координаты вне допустимого диапазона широты/долготы — похоже, файл "
            "экспортирован не в системе координат WGS84 (EPSG:4326). Проверьте CRS "
            "при экспорте из QGIS.",
        )

    def test_does_not_create_any_site(self):
        before = Site.objects.count()
        self.client.post(
            "/api/geo/parse-geometry/",
            {"file": self._upload(GEOJSON_WGS84_NO_CRS, "site.geojson")},
            format="multipart",
        )
        self.assertEqual(Site.objects.count(), before)


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
