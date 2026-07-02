"""Наполнение справочника КАТО: 17 областей + районы + города ОБЛАСТНОГО значения
(не районного) + 3 города республиканского значения. Источник — ru.wikipedia.org
(статьи «Административно-территориальное деление N области») и stat.gov.kz
(«Административно-территориальные единицы Республики Казахстан», на 01.01.2025).
Данные сверены человеком по образцу (Акмолинская, Северо-Казахстанская), остальные
15 областей — исследованы отдельно; неоднозначные пункты см. docs/sessions.

Данные редактируются через Django Admin (Region/District/City) без новой миграции,
если найдётся неточность.
"""
import json
from pathlib import Path

from django.db import migrations

FIXTURE_PATH = Path(__file__).resolve().parent.parent / "fixtures" / "kato_regions.json"


def load_kato_data(apps, schema_editor):
    Region = apps.get_model("geo", "Region")
    District = apps.get_model("geo", "District")
    City = apps.get_model("geo", "City")

    with open(FIXTURE_PATH, encoding="utf-8") as f:
        data = json.load(f)

    for region_data in data["regions"]:
        region = Region.objects.create(name=region_data["name"])
        District.objects.bulk_create([
            District(region=region, name=name) for name in region_data["districts"]
        ])
        City.objects.bulk_create([
            City(region=region, name=name) for name in region_data["cities"]
        ])

    City.objects.bulk_create([
        City(region=None, name=name) for name in data["republican_cities"]
    ])


def unload_kato_data(apps, schema_editor):
    Region = apps.get_model("geo", "Region")
    District = apps.get_model("geo", "District")
    City = apps.get_model("geo", "City")
    District.objects.all().delete()
    City.objects.all().delete()
    Region.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ("geo", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(load_kato_data, unload_kato_data),
    ]
