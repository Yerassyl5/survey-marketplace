"""
Парсинг гео-файлов (KML, GeoJSON) и извлечение геометрии.

Публичный интерфейс: parse_geo_file(file) → (GEOSGeometry, format_str).
Все ошибки поднимаются как rest_framework.exceptions.ValidationError (→ 400).
"""
from __future__ import annotations

import json
import os
import tempfile

from django.contrib.gis.gdal import DataSource, GDALException
from django.contrib.gis.geos import GeometryCollection, GEOSGeometry, WKBWriter
from rest_framework.exceptions import ValidationError

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 МБ
ALLOWED_EXTENSIONS = {".kml", ".geojson", ".json"}


def _detect_format(filename: str, content: bytes) -> str:
    ext = os.path.splitext(filename.lower())[1]
    if ext == ".kml":
        return "kml"
    if ext in (".geojson", ".json"):
        return "geojson"
    # Попытка угадать по содержимому
    stripped = content.lstrip()
    if stripped.startswith(b"{"):
        return "geojson"
    if stripped.startswith(b"<") and b"kml" in stripped[:512].lower():
        return "kml"
    raise ValidationError(
        f"Неподдерживаемый формат файла. Расширение «{ext}» не разрешено. "
        "Загружайте файлы .kml, .geojson или .json."
    )


def _force_2d(geom: GEOSGeometry) -> GEOSGeometry:
    # KML хранит координаты с высотой (lon, lat, alt). Site.geometry — 2D-поле PostGIS,
    # поэтому Z сбрасываем через WKBWriter с outdim=2.
    if not geom.hasz:
        return geom
    writer = WKBWriter()
    writer.outdim = 2
    return GEOSGeometry(writer.write(geom), srid=geom.srid or 4326)


def _geoms_to_single(geoms: list[GEOSGeometry]) -> GEOSGeometry:
    """Одна геометрия возвращается как есть, несколько — GeometryCollection."""
    if len(geoms) == 1:
        return geoms[0]
    return GeometryCollection(*geoms, srid=4326)


def _parse_kml(content: bytes) -> GEOSGeometry:
    # GDAL требует путь к файлу, поэтому пишем во временный файл.
    tmp = tempfile.NamedTemporaryFile(suffix=".kml", delete=False)
    try:
        tmp.write(content)
        tmp.flush()
        tmp.close()
        try:
            ds = DataSource(tmp.name)
        except GDALException as exc:
            raise ValidationError(f"Не удалось прочитать KML: {exc}") from exc

        geoms: list[GEOSGeometry] = []
        for layer in ds:
            for feature in layer:
                try:
                    g = feature.geom.geos
                    g.srid = 4326
                    geoms.append(g)
                except Exception:
                    # пропускаем фичи без геометрии
                    continue

        if not geoms:
            raise ValidationError("KML-файл не содержит геометрий.")

        result = _geoms_to_single(geoms)
    finally:
        os.unlink(tmp.name)

    return result


def _parse_geojson(content: bytes) -> GEOSGeometry:
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ValidationError("GeoJSON должен быть в кодировке UTF-8.") from exc

    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValidationError(f"Некорректный JSON: {exc}") from exc

    geom_type = data.get("type")

    try:
        if geom_type == "FeatureCollection":
            features = data.get("features") or []
            raw_geoms = [f["geometry"] for f in features if f.get("geometry")]
            if not raw_geoms:
                raise ValidationError("GeoJSON FeatureCollection не содержит геометрий.")
            geoms = [GEOSGeometry(json.dumps(g)) for g in raw_geoms]
        elif geom_type == "Feature":
            if not data.get("geometry"):
                raise ValidationError("GeoJSON Feature не содержит геометрии.")
            geoms = [GEOSGeometry(json.dumps(data["geometry"]))]
        else:
            # Голая геометрия (Point, Polygon, MultiPolygon …)
            geoms = [GEOSGeometry(text)]
    except ValidationError:
        raise
    except Exception as exc:
        raise ValidationError(f"Не удалось распарсить геометрию GeoJSON: {exc}") from exc

    result = _geoms_to_single(geoms)
    result.srid = 4326
    return result


def parse_geo_file(file) -> tuple[GEOSGeometry, str]:
    """
    Принимает InMemoryUploadedFile (из request.FILES).
    Возвращает (GEOSGeometry, format_name).
    Поднимает rest_framework.exceptions.ValidationError при любой ошибке.
    """
    if file.size > MAX_FILE_SIZE:
        raise ValidationError(
            f"Файл слишком большой ({file.size // 1024} КБ). Максимум — 10 МБ."
        )

    content: bytes = file.read()
    fmt = _detect_format(file.name, content)

    if fmt == "kml":
        geom = _parse_kml(content)
    else:
        geom = _parse_geojson(content)

    geom = _force_2d(geom)

    if not geom.valid:
        raise ValidationError(f"Геометрия невалидна: {geom.valid_reason}")

    return geom, fmt
