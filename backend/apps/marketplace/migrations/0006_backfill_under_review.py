# Существующие заявки со status=open, у которых уже есть отклики, переводим в
# under_review — по новой семантике open означает «откликов ещё нет» (см.
# architecture.md §4.3, docs/progress.md запись 2026-07-13). awarded/
# result_submitted/accepted не трогаем — их статусы уже корректны.
from django.db import migrations


def forwards(apps, schema_editor):
    Request = apps.get_model("marketplace", "Request")
    Request.objects.filter(
        status="open", bids__isnull=False
    ).distinct().update(status="under_review")


def backwards(apps, schema_editor):
    Request = apps.get_model("marketplace", "Request")
    Request.objects.filter(status="under_review").update(status="open")


class Migration(migrations.Migration):

    dependencies = [
        ("marketplace", "0005_bid_considered_at_alter_request_status"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
