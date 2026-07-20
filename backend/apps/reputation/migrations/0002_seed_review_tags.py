"""Начальный набор тегов отзыва — 6 штук, только положительные (architecture.md
§4.5, PRODUCT_SPEC 1.10). Список утверждён пользователем (не автономный выбор):
цена и качество оборудования исключены — цена согласована заранее (тег
ставился бы механически), оборудование заказчик обычно не в состоянии оценить.

Список короткий (6 строк) — отдельный JSON-фикстур-файл (как у geo/kato) не
заводим, это избыточно для такого объёма. Правки после сева — через Django
Admin (ReviewTagAdmin), без новой миграции, тот же принцип, что уже у geo.
"""
from django.db import migrations

TAGS = [
    "Соблюдает сроки",
    "Качественная работа",
    "Чёткая коммуникация",
    "Аккуратная документация",
    "Оперативно на связи",
    "Выехал на объект вовремя",
]


def seed_review_tags(apps, schema_editor):
    ReviewTag = apps.get_model("reputation", "ReviewTag")
    ReviewTag.objects.bulk_create([ReviewTag(name=name) for name in TAGS])


def unseed_review_tags(apps, schema_editor):
    ReviewTag = apps.get_model("reputation", "ReviewTag")
    ReviewTag.objects.filter(name__in=TAGS).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("reputation", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_review_tags, unseed_review_tags),
    ]
