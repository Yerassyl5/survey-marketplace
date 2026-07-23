# Celery-рекомендация: гарантирует, что config.celery.app (брокер — Redis,
# см. config/celery.py) загружен в ЛЮБОМ процессе, использующем Django-
# настройки этого проекта (manage.py shell, runserver, тесты, вызовы .delay()
# из вьюх) — не только в процессе, явно запущенном как `celery -A config
# worker`. Без этого файла @shared_task/.delay() молча связывается с
# дефолтным Celery-приложением (дефолтный AMQP-брокер на localhost), а не с
# config.celery.app — найдено фактом при проверке send_email_task из shell
# (этап 0, блок 1.11): ConnectionRefusedError на AMQP вместо Redis.
from .celery import app as celery_app

__all__ = ("celery_app",)
