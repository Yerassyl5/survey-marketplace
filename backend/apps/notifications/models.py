from django.db import models
from django.utils import timezone


class AuditLog(models.Model):
    """Append-only журнал доменных событий (architecture.md §5, PRODUCT_SPEC
    1.9). Пишется ОДНИМ подписчиком (notifications.subscribers.record_event),
    подключённым через common.events.subscribe_all() — получает КАЖДОЕ
    опубликованное событие без исключений по типу (иначе новый тип события,
    для которого забыли явно подписать журнал, тихо выпал бы из него — дыра,
    которую заметят только при разборе спора, когда записи не окажется).

    Поля намеренно НЕТ: "author" (кто совершил действие). Датаклассы событий
    (apps/*/events.py) не имеют единообразного поля-актёра — например,
    BidConsidered.contractor_id это владелец РАССМОТРЕННОГО отклика, а не
    заказчик, который нажал «рассмотреть» (реальный актёр). Эвристика
    «угадать автора по одному из id в payload» была бы верна для одних
    событий и НЕВЕРНА для других — а неверная запись в журнале хуже
    отсутствующей, потому что на неё будут полагаться при разборе спора.
    payload хранит датакласс целиком (dataclasses.asdict) — все id, включая
    вероятного актёра, там есть и читаемы вручную при разборе конкретного
    инцидента. Если поле «автор» когда-нибудь понадобится — обсуждать
    отдельно и предметно, не «доделывать» по аналогии с этим комментарием.
    """
    event_type = models.CharField(max_length=255)
    payload = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        # created_at хранится в UTC (USE_TZ=True) — timezone.localtime()
        # переводит в settings.TIME_ZONE (Asia/Almaty) перед форматированием.
        # Без этого шага strftime/f-string печатают сырой UTC — та же
        # находка, что и в UserAdmin.last_login_display (admin.py, блок
        # «Сброс пароля»); readonly_fields-колонка created_at в AuditLogAdmin
        # эту конвертацию делает автоматически (стандартный рендер поля
        # DateTimeField в Django Admin), а __str__ — нет, потому что это
        # ручное форматирование, не встроенный виджет.
        return f"{self.event_type} @ {timezone.localtime(self.created_at):%Y-%m-%d %H:%M:%S}"
