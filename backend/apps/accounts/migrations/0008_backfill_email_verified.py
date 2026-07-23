# Грандфазеринг (architecture.md §4.7): пользователи, зарегистрированные
# ДО появления гейта подтверждения почты, не должны терять доступ задним
# числом — всем существующим на момент внедрения проставляется True.
# Только новые регистрации получают честный default=False (схема, 0007).
from django.db import migrations


def set_existing_users_verified(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    User.objects.all().update(is_email_verified=True)


def noop_reverse(apps, schema_editor):
    # Откатывать нечего: при обратной миграции 0007 удаляет колонку
    # is_email_verified целиком — значения, которые эта миграция
    # проставила, физически перестают существовать вместе с полем.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0007_user_is_email_verified'),
    ]

    operations = [
        migrations.RunPython(set_existing_users_verified, noop_reverse),
    ]
