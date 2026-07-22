# Существующие pending-записи, у которых НИ ОДНОГО скана не загружено, переводим
# в not_submitted — по новой семантике pending означает «документы поданы, ждут
# решения модератора» (см. docs/progress.md, задача 8 из проверки этапа 4).
from django.db import migrations


def forwards(apps, schema_editor):
    # Условие — ОБА скана пусты. Исполнитель, загрузивший только один документ
    # (например диплом без лицензии), сознательно остаётся pending, не
    # откатывается в not_submitted: частичная загрузка — это уже состояние,
    # требующее внимания модератора («что-то подано, решение не принято»), а не
    # «ничего не подано». На проде такие записи будут — это не баг миграции.
    ContractorProfile = apps.get_model("accounts", "ContractorProfile")
    ContractorProfile.objects.filter(
        verification_status="pending", license_scan="", attestation_scan="",
    ).update(verification_status="not_submitted")


def backwards(apps, schema_editor):
    # Приблизительно by design: not_submitted — новый дефолт модели, поэтому
    # к моменту отката в not_submitted могут попасть и записи, которые НИКОГДА
    # не были pending (новые регистрации после раскатки миграции вперёд).
    # Откат смешивает их с теми, что реально были переведены форвардом — точное
    # восстановление исходного состояния здесь невозможно в принципе, не только
    # в этой реализации. Это осознанный компромисс отката data-миграции, не
    # недосмотр.
    ContractorProfile = apps.get_model("accounts", "ContractorProfile")
    ContractorProfile.objects.filter(verification_status="not_submitted").update(verification_status="pending")


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0005_alter_contractorprofile_verification_status"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
