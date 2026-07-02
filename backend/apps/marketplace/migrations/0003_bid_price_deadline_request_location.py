import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("marketplace", "0002_remove_request_result_file_resultfile"),
        ("geo", "0001_initial"),
    ]

    operations = [
        # Цена и срок — предложение исполнителя в отклике, не поля заявки.
        migrations.AddField(
            model_name="bid",
            name="price",
            field=models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True),
        ),
        migrations.AddField(
            model_name="bid",
            name="deadline_days",
            field=models.PositiveIntegerField(null=True, blank=True),
        ),
        # Локация заявки: текстовый city заменяется на справочник geo.City/geo.District.
        # Существующие текстовые значения city в dev-БД не переносятся (нет надёжного
        # автосопоставления строки со справочником) — принято осознанно, прод-данных нет.
        migrations.RemoveField(
            model_name="request",
            name="city",
        ),
        migrations.AddField(
            model_name="request",
            name="location_type",
            field=models.CharField(
                max_length=20,
                choices=[("city", "Город"), ("district", "Район")],
                default="city",
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="request",
            name="city",
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="requests", to="geo.city",
            ),
        ),
        migrations.AddField(
            model_name="request",
            name="district",
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="requests", to="geo.district",
            ),
        ),
    ]
