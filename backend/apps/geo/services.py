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


def _validate_wgs84_bounds(geom: GEOSGeometry) -> None:
    # Defense-in-depth независимо от источника (KML/GeoJSON/будущие форматы).
    # _extract_geoms_from_datasource репроецирует по CRS файла, если она
    # распознана GDAL, — но если CRS не распозналась (битый/нестандартный
    # crs-член) или парсер обманулся, координаты вне физического диапазона
    # WGS84 не должны молча уйти в БД: Site.geometry — GeometryField (не
    # GeographyField), PostGIS сам их не отклонит.
    min_x, min_y, max_x, max_y = geom.extent
    if not (-180 <= min_x <= 180 and -180 <= max_x <= 180 and -90 <= min_y <= 90 and -90 <= max_y <= 90):
        raise ValidationError(
            "Координаты вне допустимого диапазона широты/долготы — похоже, файл "
            "экспортирован не в системе координат WGS84 (EPSG:4326). Проверьте CRS "
            "при экспорте из QGIS."
        )


def _geoms_to_single(geoms: list[GEOSGeometry]) -> GEOSGeometry:
    """Одна геометрия возвращается как есть, несколько — GeometryCollection."""
    if len(geoms) == 1:
        return geoms[0]
    return GeometryCollection(*geoms, srid=4326)


def _extract_geoms_from_datasource(ds: DataSource) -> list[GEOSGeometry]:
    """Общий путь чтения геометрий для KML и GeoJSON через GDAL.

    У KML CRS всегда WGS84 по спецификации формата. У GeoJSON GDAL берёт CRS
    из crs-члена файла (легаси-поле, которое реально пишет QGIS/ogr2ogr при
    экспорте не в 4326 — например urn:ogc:def:crs:EPSG::32642), либо по
    умолчанию считает WGS84, если crs-члена нет (RFC 7946). В любом случае,
    если геометрия пришла не в 4326, репроецируем явно — не полагаемся на
    молчаливое приведение SRID.
    """
    geoms: list[GEOSGeometry] = []
    for layer in ds:
        for feature in layer:
            try:
                ogr_geom = feature.geom
            except GDALException:
                # нет геометрии у фичи — пропускаем
                continue
            if ogr_geom is None:
                continue
            if ogr_geom.srs is not None and ogr_geom.srs.srid != 4326:
                ogr_geom.transform(4326)
            g = ogr_geom.geos
            g.srid = 4326
            geoms.append(g)
    return geoms


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

        geoms = _extract_geoms_from_datasource(ds)
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
        json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValidationError(f"Некорректный JSON: {exc}") from exc

    # Тот же GDAL-путь, что и для KML (см. _extract_geoms_from_datasource) —
    # вместо ручного парсинга координат через голый GEOSGeometry(), который
    # игнорировал crs-член файла и слепо ставил srid=4326 независимо от
    # реальной системы координат.
    tmp = tempfile.NamedTemporaryFile(suffix=".geojson", delete=False)
    try:
        tmp.write(content)
        tmp.flush()
        tmp.close()
        try:
            ds = DataSource(tmp.name)
        except GDALException as exc:
            raise ValidationError(f"Не удалось прочитать GeoJSON: {exc}") from exc

        geoms = _extract_geoms_from_datasource(ds)
        if not geoms:
            raise ValidationError("GeoJSON-файл не содержит геометрий.")

        result = _geoms_to_single(geoms)
    finally:
        os.unlink(tmp.name)

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
    _validate_wgs84_bounds(geom)

    if not geom.valid:
        raise ValidationError(f"Геометрия невалидна: {geom.valid_reason}")

    return geom, fmt
